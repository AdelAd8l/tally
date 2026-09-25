import json
from datetime import datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest
from pywebpush import WebPushException
from sqlalchemy import create_engine, inspect, text

from app import migrate, notify
from app.database import SessionLocal
from app.models import PushSubscription

from .conftest import add_tx

CAIRO = ZoneInfo("Africa/Cairo")
SUB = {"endpoint": "https://push.example.com/abc", "keys": {"p256dh": "BPk3", "auth": "a1"}}


@pytest.fixture
def pushed(monkeypatch):
    sent = []
    monkeypatch.setattr(notify, "webpush", lambda info, data, **kw: sent.append(json.loads(data)))
    return sent


@pytest.fixture
def subscribed(client, ids):
    # Only the notification being tested: switch the others off.
    client.patch("/api/auth/me", json={"daily_reminder": False, "monthly_summary": False})
    assert client.post("/api/push/subscribe", json=SUB).status_code == 204
    return ids


def run(when: datetime) -> int:
    with SessionLocal() as db:
        return notify.run_once(db, when)


def at(month: int, day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(2026, month, day, hour, minute, tzinfo=CAIRO)


def test_key_is_stable(client):
    first = client.get("/api/push/key").json()["public_key"]
    assert len(first) == 87
    assert client.get("/api/push/key").json()["public_key"] == first


def test_budget_alerts_at_80_and_100_percent(client, subscribed, pushed):
    ids = subscribed
    client.put("/api/budgets", json={"category_id": ids["Groceries"], "amount": 100000})
    add_tx(client, ids, amount=50000, day="2026-09-03")
    assert run(at(9, 10, 12)) == 0  # 50%
    add_tx(client, ids, amount=35000, day="2026-09-10")
    assert run(at(9, 10, 12)) == 1  # 85%
    assert pushed[-1]["title"] == "80% of your Groceries budget used"
    assert pushed[-1]["body"] == "USD 850 of USD 1,000 spent, USD 150 left"
    assert run(at(9, 10, 13)) == 0  # already told
    add_tx(client, ids, amount=20050, day="2026-09-11")
    assert run(at(9, 11, 12)) == 1
    assert pushed[-1]["title"] == "Groceries budget used up"
    assert pushed[-1]["body"] == "USD 1,050.50 of USD 1,000 spent, USD 50.50 over"
    assert run(at(10, 2, 12)) == 0  # new month: spending starts again


def test_jumping_past_the_budget_sends_one_alert(client, subscribed, pushed):
    ids = subscribed
    client.put("/api/budgets", json={"category_id": ids["Dining"], "amount": 10000})
    add_tx(client, ids, category="Dining", amount=12000, day="2026-09-05")
    assert run(at(9, 5, 20)) == 1
    assert pushed[0]["title"] == "Dining budget used up"
    assert run(at(9, 5, 21)) == 0


def test_budget_alerts_in_arabic(client, subscribed, pushed):
    ids = subscribed
    client.patch("/api/auth/me", json={"lang": "ar", "currency": "EGP"})
    client.put("/api/budgets", json={"category_id": ids["Groceries"], "amount": 100000})
    add_tx(client, ids, amount=90000, day="2026-09-03")
    run(at(9, 10, 12))
    assert pushed[0]["title"] == "استخدمت 80% من ميزانية البقالة"
    assert "EGP 900" in pushed[0]["body"]


def test_daily_reminder_only_when_nothing_logged(client, ids, pushed):
    client.patch("/api/auth/me", json={"monthly_summary": False, "daily_time": "21:00"})
    client.post("/api/push/subscribe", json=SUB)
    today = datetime.now(CAIRO).date()

    def local(h, m=0):
        return datetime(today.year, today.month, today.day, h, m, tzinfo=CAIRO)

    assert run(local(20, 59)) == 0
    assert run(local(21, 5)) == 1
    assert pushed[0]["title"] == "Spent anything today?"
    assert run(local(21, 30)) == 0  # once a day


def test_no_daily_reminder_after_logging(client, ids, pushed):
    client.patch("/api/auth/me", json={"monthly_summary": False})
    client.post("/api/push/subscribe", json=SUB)
    add_tx(client, ids, amount=500)
    today = datetime.now(CAIRO).date()
    assert run(datetime(today.year, today.month, today.day, 21, 5, tzinfo=CAIRO)) == 0


def test_daily_reminder_is_skipped_if_too_late(client, ids, pushed):
    client.patch("/api/auth/me", json={"monthly_summary": False})
    client.post("/api/push/subscribe", json=SUB)
    today = datetime.now(CAIRO).date()
    assert run(datetime(today.year, today.month, today.day, 22, 30, tzinfo=CAIRO)) == 0


def test_monthly_summary_on_the_first(client, ids, pushed):
    client.patch("/api/auth/me", json={"daily_reminder": False, "notify_budgets": False})
    client.post("/api/push/subscribe", json=SUB)
    add_tx(client, ids, category="Salary", kind="income", amount=2000000, day="2026-08-01")
    add_tx(client, ids, category="Housing", amount=900000, day="2026-08-02")
    add_tx(client, ids, category="Groceries", amount=300000, day="2026-08-20")
    add_tx(client, ids, category="Groceries", amount=5000, day="2026-09-01")  # this month: not counted
    assert run(at(9, 1, 8, 59)) == 0
    assert run(at(9, 1, 9, 0)) == 1
    assert pushed[0]["title"] == "Your August in numbers"
    assert pushed[0]["body"] == "Spent USD 12,000, earned USD 20,000, saved USD 8,000. Most went on Housing"
    assert run(at(9, 1, 10, 0)) == 0
    assert run(at(10, 1, 12, 30)) == 0  # outside the morning window


def test_no_summary_for_an_empty_month(client, ids, pushed):
    client.patch("/api/auth/me", json={"daily_reminder": False})
    client.post("/api/push/subscribe", json=SUB)
    assert run(at(9, 1, 10)) == 0


def test_nothing_without_a_device(client, ids, pushed):
    client.put("/api/budgets", json={"category_id": ids["Groceries"], "amount": 100})
    add_tx(client, ids, amount=500, day="2026-09-03")
    assert run(at(9, 10, 12)) == 0


def test_gone_devices_are_forgotten(client, user, monkeypatch):
    def gone(*_, **__):
        raise WebPushException("gone", response=SimpleNamespace(status_code=410, text=""))

    monkeypatch.setattr(notify, "webpush", gone)
    client.post("/api/push/subscribe", json=SUB)
    assert client.post("/api/push/test").status_code == 409
    with SessionLocal() as db:
        assert db.query(PushSubscription).count() == 0


def test_test_notification_and_unsubscribe(client, user, pushed):
    assert client.post("/api/push/test").status_code == 409
    client.post("/api/push/subscribe", json=SUB)
    assert client.post("/api/push/test").json() == {"sent": 1}
    assert pushed[0]["title"] == "Tally"
    client.post("/api/push/unsubscribe", json={"endpoint": SUB["endpoint"]})
    assert client.post("/api/push/test").status_code == 409


def test_settings_validation(client, user):
    assert client.patch("/api/auth/me", json={"timezone": "Mars/Base"}).status_code == 422
    assert client.patch("/api/auth/me", json={"daily_time": "25:00"}).status_code == 422
    me = client.patch("/api/auth/me", json={"timezone": "Asia/Dubai", "daily_time": "22:30", "lang": "ar"}).json()
    assert (me["timezone"], me["daily_time"], me["lang"]) == ("Asia/Dubai", "22:30", "ar")


def test_deleting_the_account_removes_devices(client, user):
    client.post("/api/push/subscribe", json=SUB)
    assert client.delete("/api/auth/me").status_code == 204
    with SessionLocal() as db:
        assert db.query(PushSubscription).count() == 0


def test_migration_adds_columns_to_an_old_database(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR(255), currency VARCHAR(3))"))
        conn.execute(text("INSERT INTO users (id, email, currency) VALUES (1, 'a@b.c', 'EGP')"))
    added = migrate.upgrade(engine)
    assert "users.daily_time" in added
    assert migrate.upgrade(engine) == []  # second run: nothing to do
    columns = {c["name"] for c in inspect(engine).get_columns("users")}
    assert {"timezone", "lang", "notify_budgets", "daily_reminder", "daily_time", "monthly_summary"} <= columns
    with engine.connect() as conn:
        assert conn.execute(text("SELECT daily_time, lang FROM users")).one() == ("21:00", "en")


def test_signup_keeps_the_phones_time_zone(client):
    body = {"email": "dubai@example.com", "name": "D", "password": "password123", "timezone": "Asia/Dubai"}
    assert client.post("/api/auth/register", json=body).json()["timezone"] == "Asia/Dubai"
    client.post("/api/auth/logout")
    bad = {**body, "email": "mars@example.com", "timezone": "Mars/Base"}
    assert client.post("/api/auth/register", json=bad).status_code == 422
    plain = {k: v for k, v in body.items() if k != "timezone"} | {"email": "cairo@example.com"}
    assert client.post("/api/auth/register", json=plain).json()["timezone"] == "Africa/Cairo"
