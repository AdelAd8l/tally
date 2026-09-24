import os

os.environ["TALLY_DATABASE_URL"] = "sqlite://"
os.environ["TALLY_STATIC_DIR"] = "/nonexistent"
os.environ["TALLY_SECRET_KEY"] = "test-secret-key-that-is-long-enough-for-hs256"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with TestClient(app) as c:
        yield c


def signup(client, email="ada@example.com", password="correct-horse"):
    r = client.post("/api/auth/register", json={"email": email, "name": "Ada", "password": password})
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture
def user(client):
    return signup(client)


@pytest.fixture
def ids(client, user):
    """Handy ids from the starter data."""
    accounts = client.get("/api/accounts").json()
    cats = {c["name"]: c["id"] for c in client.get("/api/categories").json()}
    return {"account": accounts[0]["id"], **cats}


def add_tx(client, ids, category="Groceries", amount=1000, kind="expense", day="2026-03-10", note=""):
    body = {
        "account_id": ids["account"],
        "category_id": ids[category] if category else None,
        "kind": kind,
        "amount": amount,
        "occurred_on": day,
        "note": note,
    }
    r = client.post("/api/transactions", json=body)
    assert r.status_code == 201, r.text
    return r.json()
