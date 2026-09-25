from sqlalchemy import func, select

from app.database import Base, SessionLocal

from .conftest import add_tx, signup

ADMIN = {"email": "adool1832007@gmail.com", "password": "admin"}
NEW = "a-much-better-password"


def admin_login(client, password="admin"):
    r = client.post("/api/auth/login", json={**ADMIN, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def ready_admin(client):
    """Sign in as the admin and get past the first-time password change."""
    admin_login(client)
    r = client.post("/api/auth/password", json={"current_password": "admin", "new_password": NEW})
    assert r.status_code == 204, r.text


def test_admin_exists_with_starter_data_and_must_change_password(client):
    me = admin_login(client)
    assert me["is_admin"] and me["must_change_password"]
    assert client.get("/api/admin/users").status_code == 403
    assert client.get("/api/accounts").status_code == 403
    ready_admin(client)
    assert client.get("/api/admin/users").status_code == 200
    assert len(client.get("/api/accounts").json()) == 1  # usable like any account
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json=ADMIN).status_code == 401
    admin_login(client, NEW)


def test_regular_users_cannot_use_admin(client, user):
    assert client.get("/api/admin/users").status_code == 403
    assert client.delete("/api/admin/users/1").status_code == 403


def make_person(client, email="sara@example.com"):
    """A user with transactions, a budget and a push device."""
    client.post("/api/auth/logout")
    signup(client, email=email)
    accounts = client.get("/api/accounts").json()
    cats = {c["name"]: c["id"] for c in client.get("/api/categories").json()}
    ids = {"account": accounts[0]["id"], **cats}
    add_tx(client, ids, amount=5000)
    add_tx(client, ids, category="Salary", kind="income", amount=900000)
    client.put("/api/budgets", json={"category_id": cats["Groceries"], "amount": 100000})
    sub = {"endpoint": f"https://push.example.com/{email}", "keys": {"p256dh": "k", "auth": "a"}}
    client.post("/api/push/subscribe", json=sub)
    uid = client.get("/api/auth/me").json()["id"]
    client.post("/api/auth/logout")
    return uid


def rows_owned_by(user_id):
    with SessionLocal() as db:
        counts = {}
        for table in Base.metadata.sorted_tables:
            column = table.c.get("user_id") if table.name != "users" else table.c.id
            if column is not None:
                counts[table.name] = db.scalar(select(func.count()).select_from(table).where(column == user_id))
        return counts


def test_list_and_search_with_counts(client):
    make_person(client)
    ready_admin(client)
    users = client.get("/api/admin/users").json()
    sara = next(u for u in users if u["email"] == "sara@example.com")
    assert (sara["accounts"], sara["transactions"], sara["budgets"]) == (1, 2, 1)
    assert [u["email"] for u in client.get("/api/admin/users", params={"q": "SARA"}).json()] == ["sara@example.com"]


def test_delete_removes_every_trace(client):
    uid = make_person(client)
    other = make_person(client, "keep@example.com")
    before = rows_owned_by(uid)
    assert all(
        before[t] > 0 for t in ("users", "accounts", "categories", "transactions", "budgets", "push_subscriptions")
    )
    ready_admin(client)
    assert client.delete(f"/api/admin/users/{uid}").status_code == 204
    assert all(n == 0 for n in rows_owned_by(uid).values()), rows_owned_by(uid)
    assert rows_owned_by(other)["transactions"] == 2
    assert client.delete(f"/api/admin/users/{uid}").status_code == 404


def test_edit_and_reset_password(client):
    uid = make_person(client)
    ready_admin(client)
    r = client.patch(
        f"/api/admin/users/{uid}", json={"name": "Sara A.", "email": "SARA.A@example.com", "currency": "AED"}
    )
    assert r.status_code == 200, r.text
    assert (r.json()["name"], r.json()["email"], r.json()["currency"]) == ("Sara A.", "sara.a@example.com", "AED")
    assert client.patch(f"/api/admin/users/{uid}", json={"currency": "dirham"}).status_code == 422
    assert client.patch(f"/api/admin/users/{uid}", json={"email": "adool1832007@gmail.com"}).status_code == 409
    assert client.patch(f"/api/admin/users/{uid}", json={"new_password": "temporary-pass"}).json()[
        "must_change_password"
    ]
    client.post("/api/auth/logout")
    me = client.post("/api/auth/login", json={"email": "sara.a@example.com", "password": "temporary-pass"}).json()
    assert me["must_change_password"]
    assert client.get("/api/transactions").status_code == 403


def test_password_reset_signs_the_user_out(client):
    uid = make_person(client)
    signed_in = client.post("/api/auth/login", json={"email": "sara@example.com", "password": "correct-horse"})
    old_cookie = signed_in.cookies.get("tally_session")
    client.post("/api/auth/logout")
    ready_admin(client)
    client.patch(f"/api/admin/users/{uid}", json={"new_password": "temporary-pass"})
    client.cookies.set("tally_session", old_cookie)
    assert client.get("/api/auth/me").status_code == 401


def test_admin_cannot_lock_themselves_out(client):
    ready_admin(client)
    me = client.get("/api/auth/me").json()
    assert client.patch(f"/api/admin/users/{me['id']}", json={"is_admin": False}).status_code == 422
    assert client.delete(f"/api/admin/users/{me['id']}").status_code == 422


def test_existing_account_with_the_admin_email_becomes_admin(client):
    from app.routers.admin import ensure_admin

    with SessionLocal() as db:
        from app.models import User

        admin = db.scalar(select(User).where(User.email == ADMIN["email"]))
        admin.is_admin = False
        db.commit()
    ensure_admin()
    me = admin_login(client)
    assert me["is_admin"]


def test_admin_opens_and_closes_signups(client):
    assert client.get("/api/admin/settings").status_code == 401
    ready_admin(client)
    assert client.get("/api/admin/settings").json() == {"allow_signup": True}
    assert client.put("/api/admin/settings", json={"allow_signup": False}).json() == {"allow_signup": False}
    assert client.get("/api/health").json()["signup"] is False  # the sign-in page hides "Create account"
    client.post("/api/auth/logout")
    r = client.post("/api/auth/register", json={"email": "late@example.com", "name": "Late", "password": "password123"})
    assert r.status_code == 403
    ready_admin_again = client.post("/api/auth/login", json={**ADMIN, "password": NEW})
    assert ready_admin_again.status_code == 200
    client.put("/api/admin/settings", json={"allow_signup": True})
    client.post("/api/auth/logout")
    r = client.post("/api/auth/register", json={"email": "late@example.com", "name": "Late", "password": "password123"})
    assert r.status_code == 201


def test_regular_users_cannot_change_signups(client, user):
    assert client.put("/api/admin/settings", json={"allow_signup": False}).status_code == 403


def test_signup_setting_survives_a_restart(client):
    from fastapi.testclient import TestClient

    from app.main import app

    ready_admin(client)
    client.put("/api/admin/settings", json={"allow_signup": False})
    with TestClient(app) as fresh:  # a new start of the app, same database
        assert fresh.get("/api/health").json()["signup"] is False


def test_times_are_sent_with_their_time_zone(client):
    """SQLite drops the zone; without it the browser shows UTC times as local ones."""
    from datetime import UTC, datetime, timedelta

    ready_admin(client)
    (row,) = client.get("/api/admin/users").json()
    joined = datetime.fromisoformat(row["created_at"])
    assert joined.utcoffset() == timedelta(0)
    assert abs(datetime.now(UTC) - joined) < timedelta(minutes=5)
