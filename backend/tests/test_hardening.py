"""Security hardening: limits, the Google nonce, deleting an account, the import caps."""

from datetime import UTC, datetime, timedelta

import jwt

from app.config import get_settings
from app.database import SessionLocal
from app.models import PushSubscription
from app.routers import transactions

from .conftest import signup
from .test_admin import ADMIN, NEW, ready_admin
from .test_google_login import google, sign_in_with_google  # noqa: F401  (the fixture is used below)
from .test_notify import SUB


def import_csv(client, ids, rows, header="date,amount,category"):
    text = header + "\n" + "\n".join(rows)
    files = {"file": ("x.csv", text.encode(), "text/csv")}
    return client.post("/api/transactions/import", data={"account_id": ids["account"]}, files=files)


def csv_file(rows, header="date,amount,category"):
    return {"file": ("x.csv", (header + "\n" + "\n".join(rows)).encode(), "text/csv")}


# ---- public API documentation ------------------------------------------------------------


def test_api_docs_are_off_by_default(client):
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404


# ---- Google sign-in: nonce ---------------------------------------------------------------


def test_google_callback_needs_the_cookie_nonce(client, google):  # noqa: F811
    secret = get_settings().secret_key
    soon = datetime.now(UTC) + timedelta(minutes=5)
    # a signed state with no nonce at all, and no cookie (None == None used to pass)
    state = jwt.encode({"typ": "google-login", "exp": soon}, secret, algorithm="HS256")
    r = client.get("/api/auth/google/callback", params={"code": "abc", "state": state}, follow_redirects=False)
    assert r.headers["location"] == "/login?google=expired"
    assert client.get("/api/auth/me").status_code == 401


def test_a_session_cookie_is_not_accepted_as_google_state(client, google):  # noqa: F811
    signup(client, email="victim@example.com")
    session = client.cookies.get("tally_session")
    client.cookies.clear()
    r = client.get("/api/auth/google/callback", params={"code": "abc", "state": session}, follow_redirects=False)
    assert r.headers["location"] == "/login?google=expired"


# ---- Google sign-in: linking -------------------------------------------------------------


def test_google_never_replaces_the_google_id_of_an_account(client, google):  # noqa: F811
    sign_in_with_google(client)  # makes nour@gmail.com with sub g-111
    client.post("/api/auth/logout")
    google["sub"] = "g-222"  # the address is now held by somebody else
    r = sign_in_with_google(client)
    assert r.headers["location"] == "/login?google=failed"
    assert client.get("/api/auth/me").status_code == 401


def test_linking_google_removes_devices_registered_before_the_owner_arrived(client, google):  # noqa: F811
    signup(client, email="nour@gmail.com")  # someone signed up with Nour's address first...
    assert client.post("/api/push/subscribe", json=SUB).status_code == 204  # ...and added their own phone
    client.post("/api/auth/logout")
    sign_in_with_google(client)  # now the real Nour arrives with Google
    with SessionLocal() as db:
        assert db.query(PushSubscription).count() == 0


# ---- deleting an account asks again ------------------------------------------------------


def test_deleting_needs_the_password(client, user):
    assert client.request("DELETE", "/api/auth/me").status_code == 400
    assert client.request("DELETE", "/api/auth/me", json={"password": "wrong"}).status_code == 400
    assert client.get("/api/auth/me").status_code == 200  # still there
    assert client.request("DELETE", "/api/auth/me", json={"password": "correct-horse"}).status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_deleting_a_google_account_needs_the_email_typed(client, google):  # noqa: F811
    sign_in_with_google(client)
    assert client.request("DELETE", "/api/auth/me", json={"confirm_email": "other@gmail.com"}).status_code == 400
    assert client.request("DELETE", "/api/auth/me", json={"confirm_email": " Nour@Gmail.com "}).status_code == 204


def test_the_only_admin_cannot_delete_itself(client):
    ready_admin(client)
    r = client.request("DELETE", "/api/auth/me", json={"password": NEW})
    assert r.status_code == 409
    assert client.post("/api/auth/login", json={**ADMIN, "password": NEW}).status_code == 200


# ---- push devices ------------------------------------------------------------------------


def test_only_a_few_devices_per_account(client, user):
    for i in range(10):
        sub = {"endpoint": f"https://fcm.googleapis.com/fcm/send/d{i}", "keys": SUB["keys"]}
        assert client.post("/api/push/subscribe", json=sub).status_code == 204
    over = {"endpoint": "https://fcm.googleapis.com/fcm/send/one-too-many", "keys": SUB["keys"]}
    r = client.post("/api/push/subscribe", json=over)
    assert r.status_code == 409 and "Limit reached" in r.json()["detail"]
    again = {"endpoint": "https://fcm.googleapis.com/fcm/send/d3", "keys": SUB["keys"]}  # an existing one still works
    assert client.post("/api/push/subscribe", json=again).status_code == 204


# ---- per-account limits ------------------------------------------------------------------


def test_account_and_category_limits(client, user, monkeypatch):
    from app import limits
    from app.routers import accounts, categories

    monkeypatch.setattr(accounts, "MAX_ACCOUNTS", 2)
    monkeypatch.setattr(categories, "MAX_CATEGORIES", 14)  # the starter data has 13
    assert client.post("/api/accounts", json={"name": "Second"}).status_code == 201
    assert client.post("/api/accounts", json={"name": "Third"}).status_code == 409
    assert (
        client.post("/api/categories", json={"name": "One more", "kind": "expense", "color": "#ff8800"}).status_code
        == 201
    )
    assert (
        client.post("/api/categories", json={"name": "Too many", "kind": "expense", "color": "#ff8800"}).status_code
        == 409
    )
    assert limits.MAX_TRANSACTIONS == 100_000


def test_transaction_limit(client, ids, monkeypatch):
    monkeypatch.setattr(transactions, "MAX_TRANSACTIONS", 2)
    body = {"account_id": ids["account"], "kind": "expense", "amount": 100, "occurred_on": "2026-03-10"}
    assert client.post("/api/transactions", json=body).status_code == 201
    assert client.post("/api/transactions", json=body).status_code == 201
    assert client.post("/api/transactions", json=body).status_code == 409


# ---- CSV import --------------------------------------------------------------------------


def test_import_row_cap(client, ids, monkeypatch):
    monkeypatch.setattr(transactions, "MAX_IMPORT_ROWS", 3)
    ok = client.post(
        "/api/transactions/import", data={"account_id": ids["account"]}, files=csv_file(["2026-03-01,-5,"] * 3)
    )
    assert ok.status_code == 200 and ok.json()["imported"] == 3
    big = client.post(
        "/api/transactions/import", data={"account_id": ids["account"]}, files=csv_file(["2026-03-01,-5,"] * 4)
    )
    assert big.status_code == 413
    assert client.get("/api/transactions").json()["total"] == 3  # the refused file added nothing


def test_import_respects_the_transaction_limit(client, ids, monkeypatch):
    monkeypatch.setattr(transactions, "MAX_TRANSACTIONS", 2)
    r = client.post(
        "/api/transactions/import", data={"account_id": ids["account"]}, files=csv_file(["2026-03-01,-5,"] * 3)
    )
    assert r.status_code == 409
    assert client.get("/api/transactions").json()["total"] == 0


def test_import_category_names_longer_than_40_letters_do_not_crash(client, ids):
    one = "A" * 45 + "x"
    two = "A" * 45 + "y"  # the same first 40 letters
    r = client.post(
        "/api/transactions/import",
        data={"account_id": ids["account"]},
        files=csv_file([f"2026-03-01,-5,{one}", f"2026-03-02,-6,{two}"]),
    )
    assert r.status_code == 200 and r.json()["imported"] == 2
    assert len(r.json()["created_categories"]) == 1


def test_import_of_a_huge_cell_is_a_clean_error(client, ids):
    r = client.post(
        "/api/transactions/import",
        data={"account_id": ids["account"]},
        files=csv_file(["2026-03-01,-5," + "z" * 200_000]),
    )
    assert r.status_code == 422


# ---- numbers and dates that used to give a 500 -------------------------------------------


def test_month_and_balance_limits(client, user):
    assert client.get("/api/budgets", params={"month": "0000-01"}).status_code == 422
    assert client.get("/api/budgets", params={"month": "9999-12"}).status_code == 422
    assert client.get("/api/budgets", params={"month": "2026-03"}).status_code == 200
    r = client.post("/api/accounts", json={"name": "Huge", "opening_balance": 10**15})
    assert r.status_code == 422
    assert client.post("/api/accounts", json={"name": "Fine", "opening_balance": 5000}).status_code == 201
