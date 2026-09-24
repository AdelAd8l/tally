from fastapi.testclient import TestClient

from app.main import app

from .conftest import signup


def test_register_sets_session_and_starter_data(client, user):
    assert user["email"] == "ada@example.com"
    assert client.get("/api/auth/me").json()["name"] == "Ada"
    assert len(client.get("/api/accounts").json()) == 1
    assert len(client.get("/api/categories").json()) > 5


def test_duplicate_email_is_rejected(client, user):
    r = client.post("/api/auth/register", json={"email": "ADA@example.com", "name": "x", "password": "12345678"})
    assert r.status_code == 409


def test_short_password_is_rejected(client):
    r = client.post("/api/auth/register", json={"email": "a@b.co", "name": "x", "password": "short"})
    assert r.status_code == 422


def test_login_logout(client, user):
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401
    bad = client.post("/api/auth/login", json={"email": "ada@example.com", "password": "wrong-pass"})
    assert bad.status_code == 401
    ok = client.post("/api/auth/login", json={"email": "ada@example.com", "password": "correct-horse"})
    assert ok.status_code == 200
    assert client.get("/api/auth/me").status_code == 200


def test_tampered_cookie_is_rejected(client):
    client.cookies.set("tally_session", "not-a-jwt")
    assert client.get("/api/auth/me").status_code == 401


def test_update_profile_and_password(client, user):
    r = client.patch("/api/auth/me", json={"name": "Ada L.", "currency": "EUR"})
    assert r.json()["currency"] == "EUR"
    bad = client.post("/api/auth/password", json={"current_password": "nope", "new_password": "new-password"})
    assert bad.status_code == 400
    ok = client.post(
        "/api/auth/password", json={"current_password": "correct-horse", "new_password": "new-password"}
    )
    assert ok.status_code == 204


def test_users_cannot_see_each_others_data(client, ids):
    tx = client.post(
        "/api/transactions",
        json={"account_id": ids["account"], "kind": "expense", "amount": 500, "occurred_on": "2026-01-01"},
    ).json()
    with TestClient(app) as other:
        signup(other, email="bob@example.com")
        assert other.get("/api/transactions").json()["total"] == 0
        assert other.delete(f"/api/transactions/{tx['id']}").status_code == 404
        # Bob can't file a transaction against Ada's account either.
        r = other.post(
            "/api/transactions",
            json={"account_id": ids["account"], "kind": "expense", "amount": 1, "occurred_on": "2026-01-01"},
        )
        assert r.status_code == 404


def test_delete_account_removes_everything(client, ids):
    client.post(
        "/api/transactions",
        json={"account_id": ids["account"], "kind": "expense", "amount": 500, "occurred_on": "2026-01-01"},
    )
    client.put("/api/budgets", json={"category_id": ids["Dining"], "amount": 100})
    assert client.delete("/api/auth/me").status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    # The email is free again.
    signup(client)


def test_signup_can_be_closed(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "allow_signup", False)
    r = client.post("/api/auth/register", json={"email": "x@example.com", "name": "x", "password": "12345678"})
    assert r.status_code == 403
    assert client.get("/api/health").json()["signup"] is False
