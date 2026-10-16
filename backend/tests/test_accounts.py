from sqlalchemy import create_engine, text

from app import migrate


def test_digital_wallet_with_a_color_by_type(client, user):
    wallet = client.post("/api/accounts", json={"name": "Vodafone Cash", "kind": "wallet"}).json()
    assert (wallet["kind"], wallet["color"]) == ("wallet", "#8A6FA0")
    starter = client.get("/api/accounts").json()[0]
    assert starter["color"] == "#5A7FA8"  # a checking account's color


def test_account_color_can_be_chosen_and_kept(client, user):
    body = {"name": "InstaPay", "kind": "wallet", "opening_balance": 5000, "color": "#E91E63"}
    account = client.post("/api/accounts", json=body).json()
    assert account["color"] == "#E91E63"
    # saving without a color keeps the chosen one
    renamed = client.put(f"/api/accounts/{account['id']}", json={"name": "Insta", "kind": "wallet"}).json()
    assert (renamed["name"], renamed["color"]) == ("Insta", "#E91E63")
    changed = client.put(f"/api/accounts/{account['id']}", json={**body, "color": "#00AA55"}).json()
    assert changed["color"] == "#00AA55"
    assert client.post("/api/accounts", json={**body, "color": "red"}).status_code == 422
    assert client.post("/api/accounts", json={**body, "kind": "piggy"}).status_code == 422


def test_accounts_made_before_colors_get_their_types_color(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE accounts (id INTEGER PRIMARY KEY, name VARCHAR(60), kind VARCHAR(20))"))
        conn.execute(text("INSERT INTO accounts VALUES (1, 'Main', 'checking'), (2, 'Card', 'credit')"))
    assert "accounts.color" in migrate.upgrade(engine)
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT kind, color FROM accounts ORDER BY id")).all()
    assert rows == [("checking", "#5A7FA8"), ("credit", "#A0525B")]


def test_reset_one_account_to_zero(client, ids):
    from .conftest import add_tx

    other = client.post("/api/accounts", json={"name": "Cash", "kind": "cash", "opening_balance": 5000}).json()
    client.put(f"/api/accounts/{ids['account']}", json={"name": "Main", "kind": "checking", "opening_balance": 10000})
    add_tx(client, ids, amount=1500)
    body = {"account_id": other["id"], "kind": "expense", "amount": 700, "occurred_on": "2026-03-10", "note": ""}
    client.post("/api/transactions", json=body)

    assert client.post(f"/api/accounts/{ids['account']}/reset", json={}).status_code == 422
    r = client.post(f"/api/accounts/{ids['account']}/reset", json={"confirm": True})
    assert r.status_code == 200 and r.json()["balance"] == 0 and r.json()["opening_balance"] == 0

    accounts = {a["id"]: a for a in client.get("/api/accounts").json()}
    assert accounts[ids["account"]]["balance"] == 0
    assert accounts[other["id"]]["balance"] == 4300  # the other account is untouched
    assert client.get("/api/transactions").json()["total"] == 1
    assert client.post("/api/accounts/999999/reset", json={"confirm": True}).status_code == 404


def test_reset_all_accounts_to_zero(client, ids):
    from .conftest import add_tx

    other = client.post("/api/accounts", json={"name": "Cash", "kind": "cash", "opening_balance": 5000}).json()
    client.put(f"/api/accounts/{ids['account']}", json={"name": "Main", "kind": "checking", "opening_balance": 10000})
    add_tx(client, ids, amount=1500)
    assert client.post("/api/accounts/reset-all", json={"confirm": False}).status_code == 422
    r = client.post("/api/accounts/reset-all", json={"confirm": True})
    assert r.status_code == 200 and r.json() == {"deleted": 1}
    accounts = client.get("/api/accounts").json()
    assert len(accounts) == 2 and all(a["balance"] == 0 and a["opening_balance"] == 0 for a in accounts)
    assert client.get("/api/transactions").json()["total"] == 0
    assert client.get("/api/categories").json()
    assert other["id"] in {a["id"] for a in accounts}
