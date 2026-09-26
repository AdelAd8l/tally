from collections import defaultdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Account, Transaction, User
from ..months import label, month_bounds, parse_month, shift
from ..schemas import (
    CategoryTotal,
    DayTotal,
    InsightAccount,
    InsightCategory,
    InsightMonth,
    Insights,
    MonthTotal,
    Overview,
    Pace,
)
from ..security import current_user

router = APIRouter(prefix="/api/reports", tags=["reports"])


def totals(db: Session, user: User, start: date, end: date) -> tuple[int, int]:
    income, expense = db.execute(
        select(
            func.coalesce(func.sum(case((Transaction.kind == "income", Transaction.amount))), 0),
            func.coalesce(func.sum(case((Transaction.kind == "expense", Transaction.amount))), 0),
        ).where(Transaction.user_id == user.id, Transaction.occurred_on.between(start, end))
    ).one()
    return int(income), int(expense)


@router.get("/overview", response_model=Overview)
def overview(month: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    start, end = month_bounds(parse_month(month))
    prev_start, prev_end = month_bounds(shift(start, -1))
    income, expense = totals(db, user, start, end)
    previous_income, previous_expense = totals(db, user, prev_start, prev_end)

    opening = db.scalar(
        select(func.coalesce(func.sum(Account.opening_balance), 0)).where(Account.user_id == user.id)
    )
    all_income, all_expense = totals(db, user, date.min, date.max)

    expense_in_month = (
        Transaction.user_id == user.id,
        Transaction.kind == "expense",
        Transaction.occurred_on.between(start, end),
    )
    by_category = db.execute(
        select(Transaction.category_id, func.sum(Transaction.amount).label("total"))
        .where(*expense_in_month)
        .group_by(Transaction.category_id)
        .order_by(func.sum(Transaction.amount).desc())
    ).all()
    daily = db.execute(
        select(Transaction.occurred_on, func.sum(Transaction.amount))
        .where(*expense_in_month)
        .group_by(Transaction.occurred_on)
        .order_by(Transaction.occurred_on)
    ).all()

    return Overview(
        month=label(start),
        income=income,
        expense=expense,
        previous_income=previous_income,
        previous_expense=previous_expense,
        net_worth=int(opening) + all_income - all_expense,
        by_category=[CategoryTotal(category_id=c, amount=int(a)) for c, a in by_category],
        daily=[DayTotal(day=d, expense=int(a)) for d, a in daily],
    )


@router.get("/trend", response_model=list[MonthTotal])
def trend(
    end: str,
    months: int = Query(default=6, ge=1, le=24),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    last = parse_month(end)
    out = []
    for offset in range(months - 1, -1, -1):
        first = shift(last, -offset)
        income, expense = totals(db, user, *month_bounds(first))
        out.append(MonthTotal(month=label(first), income=income, expense=expense))
    return out


def _today(user: User) -> date:
    try:
        return datetime.now(ZoneInfo(user.timezone)).date()
    except (ZoneInfoNotFoundError, ValueError):
        return date.today()


@router.get("/insights", response_model=Insights)
def insights(
    end: str,
    months: int = Query(default=6, ge=1, le=24),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Everything the Reports page draws, for the `months` months ending with `end`."""
    last = parse_month(end)
    first = shift(last, -(months - 1))
    start, _ = month_bounds(first)
    _, stop = month_bounds(last)
    prev_start, prev_stop = month_bounds(shift(last, -1))
    since = min(start, prev_start)

    # One pass over the range, summed per day, kind, category and account; the rest is arithmetic.
    rows = db.execute(
        select(
            Transaction.occurred_on,
            Transaction.kind,
            Transaction.category_id,
            Transaction.account_id,
            func.sum(Transaction.amount),
        )
        .where(Transaction.user_id == user.id, Transaction.occurred_on.between(since, stop))
        .group_by(Transaction.occurred_on, Transaction.kind, Transaction.category_id, Transaction.account_id)
    ).all()

    opening = db.scalar(select(func.coalesce(func.sum(Account.opening_balance), 0)).where(Account.user_id == user.id))
    before_income, before_expense = totals(db, user, date.min, start - timedelta(days=1))
    worth = int(opening) + before_income - before_expense

    per_month: dict[str, list[int]] = defaultdict(lambda: [0, 0])  # income, expense
    per_category: dict[tuple[str, int | None], int] = defaultdict(int)
    per_account: dict[int, list[int]] = defaultdict(lambda: [0, 0])
    per_weekday = [0] * 7
    daily_expense: dict[date, int] = defaultdict(int)
    for day, kind, category_id, account_id, amount in rows:
        amount = int(amount)
        if kind == "expense":
            daily_expense[day] += amount
        if day < start:
            continue  # only the month before, for the pace line
        key = label(day)
        if kind == "income":
            per_month[key][0] += amount
            per_account[account_id][0] += amount
        else:
            per_month[key][1] += amount
            per_category[(key, category_id)] += amount
            per_account[account_id][1] += amount
            per_weekday[day.weekday()] += amount

    out_months = []
    for i in range(months):
        key = label(shift(first, i))
        income, expense = per_month[key]
        worth += income - expense
        out_months.append(InsightMonth(month=key, income=income, expense=expense, net_worth=worth))

    # Average per weekday: divide by how many of that weekday the range has had so far.
    today = _today(user)
    counted = [0] * 7
    day = start
    while day <= min(stop, today):
        counted[day.weekday()] += 1
        day += timedelta(days=1)
    weekdays = [round(total / n) if n else 0 for total, n in zip(per_weekday, counted, strict=True)]

    def running(first_day: date, last_day: date) -> list[int]:
        out, total, day = [], 0, first_day
        while day <= last_day:
            total += daily_expense.get(day, 0)
            out.append(total)
            day += timedelta(days=1)
        return out

    end_start, end_stop = month_bounds(last)
    pace = Pace(
        month=label(last),
        days=end_stop.day,
        current=running(end_start, min(end_stop, today)) if end_start <= today else [],
        previous=running(prev_start, prev_stop),
    )

    return Insights(
        months=out_months,
        categories=[
            InsightCategory(month=m, category_id=c, amount=a)
            for (m, c), a in sorted(per_category.items(), key=lambda kv: (kv[0][0], -kv[1]))
        ],
        accounts=[InsightAccount(account_id=a, income=v[0], expense=v[1]) for a, v in sorted(per_account.items())],
        weekdays=weekdays,
        pace=pace,
    )
