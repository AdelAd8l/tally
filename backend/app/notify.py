"""Budget alerts, a daily "log your spending" nudge and a monthly summary, as Web Push.

Every minute `run_once` looks at each user who has a subscribed device and works out, in the
user's own time zone, what is due:

- budget alerts when a category's spending this month passes 80% and 100% of its budget;
- a daily reminder at the chosen time, only if nothing was logged that day;
- on the 1st of the month (09:00–12:00), a summary of the month before.

Each notice is recorded in `sent_notices` *before* it is sent, under a unique key, so it goes
out exactly once even if the check runs twice or on several workers at the same time.
"""

import asyncio
import base64
import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid02
from pywebpush import WebPushException, webpush
from sqlalchemy import case, delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import get_settings
from .database import SessionLocal
from .models import AppKey, Budget, Category, PushSubscription, SentNotice, Transaction, User
from .months import label, month_bounds, shift

log = logging.getLogger("tally.notify")

THRESHOLDS = (100, 80)  # percent of a budget, highest first
SUMMARY_HOURS = (time(9, 0), time(12, 0))  # window on the 1st for the monthly summary
DAILY_WINDOW = timedelta(hours=1)  # the daily reminder is skipped if the server was down longer
KEEP_SENT = timedelta(days=45)

# ---- VAPID keys ------------------------------------------------------------------------


def _vapid(db: Session) -> Vapid02:
    pem = get_settings().vapid_private_key.strip()
    if not pem:
        row = db.get(AppKey, "vapid_private")
        if row is None:
            key = Vapid02()
            key.generate_keys()
            pem = key.private_pem().decode()
            db.add(AppKey(name="vapid_private", value=pem))
            try:
                db.commit()
            except IntegrityError:  # another worker won the race: use its key
                db.rollback()
                pem = db.get(AppKey, "vapid_private").value
        else:
            pem = row.value
    return Vapid02.from_pem(pem.encode())


def public_key(db: Session) -> str:
    """The application server key browsers need to subscribe (URL-safe base64, no padding)."""
    raw = _vapid(db).public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


# ---- texts -----------------------------------------------------------------------------

# Starter categories are created in English; show them in Arabic too (same list as the app).
NAMES_AR = {
    "Groceries": "البقالة", "Dining": "المطاعم", "Housing": "السكن", "Utilities": "الفواتير",
    "Transport": "المواصلات", "Health": "الصحة", "Shopping": "التسوق", "Entertainment": "الترفيه",
    "Education": "التعليم", "Other": "أخرى", "Salary": "الراتب", "Freelance": "عمل حر",
    "Other income": "دخل آخر", "Uncategorized": "بدون فئة",
}  # fmt: skip

MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
             "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]  # fmt: skip


def money(cents: int, currency: str) -> str:
    """1234567 -> 'EGP 12,345.67' (whole amounts drop the .00)."""
    value = cents / 100
    text = f"{value:,.0f}" if cents % 100 == 0 else f"{value:,.2f}"
    return f"{currency} {text}"


def category_name(name: str, lang: str) -> str:
    return NAMES_AR.get(name, name) if lang == "ar" else name


def budget_message(name: str, pct: int, spent: int, amount: int, currency: str, lang: str) -> dict:
    left = amount - spent
    if lang == "ar":
        title = f"تجاوزت ميزانية {name}" if pct >= 100 else f"استخدمت {pct}% من ميزانية {name}"
        body = f"صرفت {money(spent, currency)} من {money(amount, currency)}" + (
            f"، بزيادة {money(-left, currency)}" if left < 0 else f"، متبقٍ {money(left, currency)}"
        )
    else:
        title = f"{name} budget used up" if pct >= 100 else f"{pct}% of your {name} budget used"
        body = f"{money(spent, currency)} of {money(amount, currency)} spent" + (
            f", {money(-left, currency)} over" if left < 0 else f", {money(left, currency)} left"
        )
    return {"title": title, "body": body, "url": "/budgets", "tag": f"budget-{name}"}


def daily_message(lang: str) -> dict:
    if lang == "ar":
        return {"title": "هل صرفت شيئاً اليوم؟", "body": "سجّلها الآن قبل أن تنساها.", "url": "/", "tag": "daily"}
    return {"title": "Spent anything today?", "body": "Log it now while you remember.", "url": "/", "tag": "daily"}


def summary_message(month: datetime, income: int, expense: int, top: str | None, currency: str, lang: str) -> dict:
    net = income - expense
    if lang == "ar":
        title = f"ملخص {MONTHS_AR[month.month - 1]}"
        body = f"صرفت {money(expense, currency)} وكسبت {money(income, currency)}"
        body += f"، وفّرت {money(net, currency)}" if net >= 0 else f"، بعجز {money(-net, currency)}"
        if top:
            body += f". أكثر فئة: {top}"
    else:
        title = f"Your {month.strftime('%B')} in numbers"
        body = f"Spent {money(expense, currency)}, earned {money(income, currency)}"
        body += f", saved {money(net, currency)}" if net >= 0 else f", {money(-net, currency)} short"
        if top:
            body += f". Most went on {top}"
    return {"title": title, "body": body, "url": "/", "tag": "summary"}


# ---- what is due -----------------------------------------------------------------------


@dataclass
class Notice:
    user_id: int
    keys: list[str]  # the first is the one that decides; see run_once
    payload: dict


def _zone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("Africa/Cairo")


def _spent_by_category(db: Session, user_id: int, start, end) -> dict[int | None, int]:
    rows = db.execute(
        select(Transaction.category_id, func.sum(Transaction.amount))
        .where(
            Transaction.user_id == user_id, Transaction.kind == "expense", Transaction.occurred_on.between(start, end)
        )
        .group_by(Transaction.category_id)
    ).all()
    return {cat: int(total) for cat, total in rows}


def due_notices(db: Session, user: User, now: datetime) -> list[Notice]:
    """Notifications whose time has come for one user (not yet de-duplicated)."""
    tz = _zone(user.timezone)
    local = now.astimezone(tz)
    today = local.date()
    lang = user.lang if user.lang in ("en", "ar") else "en"
    out: list[Notice] = []

    if user.notify_budgets:
        start, end = month_bounds(today)
        spent = _spent_by_category(db, user.id, start, end)
        rows = db.execute(
            select(Budget, Category).join(Category, Budget.category_id == Category.id).where(Budget.user_id == user.id)
        ).all()
        for budget, category in rows:
            used = spent.get(category.id, 0)
            if budget.amount <= 0:
                continue
            pct = used * 100 / budget.amount
            crossed = [t for t in THRESHOLDS if pct >= t]
            if crossed:
                # Keys carry the budget amount, so raising a budget can alert again at the new level.
                keys = [f"b{budget.id}:{label(start)}:{budget.amount}:{t}" for t in crossed]
                name = category_name(category.name, lang)
                out.append(
                    Notice(user.id, keys, budget_message(name, crossed[0], used, budget.amount, user.currency, lang))
                )

    if user.daily_reminder:
        h, m = map(int, user.daily_time.split(":"))
        at = datetime.combine(today, time(h, m), tzinfo=tz)
        if at <= local < at + DAILY_WINDOW:
            midnight = datetime.combine(today, time(0), tzinfo=tz)
            logged = db.scalar(
                select(func.count())
                .select_from(Transaction)
                .where(Transaction.user_id == user.id, Transaction.created_at >= midnight.astimezone(UTC))
            )
            if not logged:
                out.append(Notice(user.id, [f"d:{today.isoformat()}"], daily_message(lang)))

    if user.monthly_summary and today.day == 1 and SUMMARY_HOURS[0] <= local.time() < SUMMARY_HOURS[1]:
        first = shift(today, -1)
        start, end = month_bounds(first)
        income, expense = db.execute(
            select(
                func.coalesce(func.sum(case((Transaction.kind == "income", Transaction.amount))), 0),
                func.coalesce(func.sum(case((Transaction.kind == "expense", Transaction.amount))), 0),
            ).where(Transaction.user_id == user.id, Transaction.occurred_on.between(start, end))
        ).one()
        if income or expense:
            spent = _spent_by_category(db, user.id, start, end)
            top_id = max(spent, key=spent.get) if spent else None
            top = None
            if top_id is not None:
                category = db.get(Category, top_id)
                top = category_name(category.name if category else "Uncategorized", lang)
            elif spent:
                top = category_name("Uncategorized", lang)
            month = datetime.combine(first, time(0))
            payload = summary_message(month, int(income), int(expense), top, user.currency, lang)
            out.append(Notice(user.id, [f"m:{label(start)}"], payload))
    return out


# ---- sending ---------------------------------------------------------------------------


def send_to_user(db: Session, user_id: int, payload: dict, vapid: Vapid02 | None = None) -> int:
    """Push one message to every device of a user. Returns how many accepted it."""
    vapid = vapid or _vapid(db)
    subject = get_settings().vapid_subject
    sent = 0
    for sub in db.scalars(select(PushSubscription).where(PushSubscription.user_id == user_id)).all():
        try:
            webpush(
                {"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                json.dumps(payload),
                vapid_private_key=vapid,
                vapid_claims={"sub": subject},
                ttl=3600,
                timeout=10,
            )
            sent += 1
        except WebPushException as e:
            status = e.response.status_code if e.response is not None else None
            if status in (404, 410):  # the device unsubscribed or the app was removed
                db.delete(sub)
                db.commit()
            else:
                log.warning("push to user %s failed: %s", user_id, e)
        except Exception as e:  # network trouble: try the next device
            log.warning("push to user %s failed: %s", user_id, e)
    return sent


def _claim(db: Session, user_id: int, key: str) -> bool:
    db.add(SentNotice(user_id=user_id, key=key))
    try:
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False


def run_once(db: Session, now: datetime | None = None) -> int:
    """Send every reminder that is due. Returns the number of notices recorded."""
    now = now or datetime.now(UTC)
    user_ids = db.scalars(select(PushSubscription.user_id).distinct()).all()
    if not user_ids:
        return 0
    vapid = _vapid(db)
    count = 0
    for user in db.scalars(select(User).where(User.id.in_(user_ids))).all():
        for notice in due_notices(db, user, now):
            # Claim the keys first so only one run sends it. The first key is the level reached
            # now (e.g. 100% of a budget); lower ones are recorded too, so a notice goes out only
            # when a new, higher level is reached.
            if not _claim(db, notice.user_id, notice.keys[0]):
                continue
            for key in notice.keys[1:]:
                _claim(db, notice.user_id, key)
            send_to_user(db, notice.user_id, notice.payload, vapid)
            count += 1
    db.execute(delete(SentNotice).where(SentNotice.sent_at < now - KEEP_SENT))
    db.commit()
    return count


def _tick() -> None:
    with SessionLocal() as db:
        run_once(db)


async def loop() -> None:
    """Background task started with the app: check once a minute, forever."""
    while True:
        try:
            await asyncio.to_thread(_tick)
        except Exception:
            log.exception("reminder check failed")
        await asyncio.sleep(60 - datetime.now().second)
