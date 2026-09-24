import io

from .conftest import add_tx


def test_crud(client, ids):
    tx = add_tx(client, ids, note="  Weekly shop ")
    assert tx["note"] == "Weekly shop"
    body = {**tx, "amount": 2500}
    updated = client.put(f"/api/transactions/{tx['id']}", json=body).json()
    assert updated["amount"] == 2500
    assert client.delete(f"/api/transactions/{tx['id']}").status_code == 204
    assert client.get("/api/transactions").json()["total"] == 0


def test_kind_must_match_category(client, ids):
    r = client.post(
        "/api/transactions",
        json={"account_id": ids["account"], "category_id": ids["Salary"], "kind": "expense",
              "amount": 100, "occurred_on": "2026-01-01"},
    )
    assert r.status_code == 422


def test_amount_must_be_positive(client, ids):
    r = client.post(
        "/api/transactions",
        json={"account_id": ids["account"], "kind": "expense", "amount": 0, "occurred_on": "2026-01-01"},
    )
    assert r.status_code == 422


def test_filters_search_and_totals(client, ids):
    add_tx(client, ids, "Groceries", 1000, day="2026-03-01", note="Market")
    add_tx(client, ids, "Dining", 2000, day="2026-03-15", note="Tacos")
    add_tx(client, ids, "Salary", 300000, kind="income", day="2026-03-31")
    add_tx(client, ids, "Dining", 999, day="2026-04-02")

    march = client.get("/api/transactions", params={"start": "2026-03-01", "end": "2026-03-31"}).json()
    assert march["total"] == 3
    assert march["income"] == 300000 and march["expense"] == 3000
    assert march["items"][0]["occurred_on"] == "2026-03-31"  # newest first

    assert client.get("/api/transactions", params={"q": "taco"}).json()["total"] == 1
    assert client.get("/api/transactions", params={"q": "dining"}).json()["total"] == 2  # category name
    assert client.get("/api/transactions", params={"kind": "income"}).json()["total"] == 1
    page = client.get("/api/transactions", params={"limit": 2, "offset": 2}).json()
    assert len(page["items"]) == 2 and page["total"] == 4


def test_deleting_category_keeps_transactions(client, ids):
    add_tx(client, ids, "Dining", 1500)
    assert client.delete(f"/api/categories/{ids['Dining']}").status_code == 204
    items = client.get("/api/transactions").json()["items"]
    assert items[0]["category_id"] is None
    assert client.get("/api/transactions", params={"category_id": 0}).json()["total"] == 1


def test_account_balance_and_delete_guard(client, ids):
    add_tx(client, ids, "Salary", 100000, kind="income")
    add_tx(client, ids, "Groceries", 2550)
    account = client.get("/api/accounts").json()[0]
    assert account["balance"] == 97450
    assert client.delete(f"/api/accounts/{account['id']}").status_code == 409


def test_csv_round_trip(client, ids):
    add_tx(client, ids, "Groceries", 1234, day="2026-02-03", note="Bread, milk")
    add_tx(client, ids, "Salary", 500000, kind="income", day="2026-02-01")
    csv_text = client.get("/api/transactions/export").text
    assert "2026-02-03,expense,12.34,Main account,Groceries,\"Bread, milk\"" in csv_text

    r = client.post(
        "/api/transactions/import",
        data={"account_id": ids["account"]},
        files={"file": ("tx.csv", io.BytesIO(csv_text.encode()), "text/csv")},
    )
    assert r.json() == {"imported": 2, "created_categories": []}
    assert client.get("/api/transactions").json()["total"] == 4


def test_import_by_sign_creates_categories(client, ids):
    csv_text = "Date,Amount,Category,Description\n2026-05-01,-$42.10,Pets,Vet\n2026-05-02,\"1,200.00\",Bonus,\n"
    r = client.post(
        "/api/transactions/import",
        data={"account_id": ids["account"]},
        files={"file": ("bank.csv", io.BytesIO(csv_text.encode()), "text/csv")},
    ).json()
    assert r == {"imported": 2, "created_categories": ["Pets", "Bonus"]}
    page = client.get("/api/transactions").json()
    assert page["expense"] == 4210 and page["income"] == 120000


def test_import_reports_bad_line(client, ids):
    r = client.post(
        "/api/transactions/import",
        data={"account_id": ids["account"]},
        files={"file": ("x.csv", io.BytesIO(b"date,amount\n2026-01-01,5\nyesterday,3\n"), "text/csv")},
    )
    assert r.status_code == 422 and "Line 3" in r.json()["detail"]
    assert client.get("/api/transactions").json()["total"] == 0
