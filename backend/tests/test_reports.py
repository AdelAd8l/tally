from .conftest import add_tx


def test_overview(client, ids):
    add_tx(client, ids, "Salary", 400000, kind="income", day="2026-03-01")
    add_tx(client, ids, "Groceries", 1000, day="2026-03-02")
    add_tx(client, ids, "Groceries", 500, day="2026-03-02")
    add_tx(client, ids, "Dining", 3000, day="2026-03-20")
    add_tx(client, ids, "Dining", 700, day="2026-02-10")

    o = client.get("/api/reports/overview", params={"month": "2026-03"}).json()
    assert o["income"] == 400000
    assert o["expense"] == 4500
    assert o["previous_expense"] == 700
    assert o["net_worth"] == 400000 - 5200
    assert o["by_category"][0] == {"category_id": ids["Dining"], "amount": 3000}
    assert o["daily"][0] == {"day": "2026-03-02", "expense": 1500}


def test_trend_spans_year_boundary(client, ids):
    add_tx(client, ids, "Groceries", 100, day="2025-12-31")
    add_tx(client, ids, "Groceries", 200, day="2026-01-01")
    t = client.get("/api/reports/trend", params={"end": "2026-01", "months": 3}).json()
    assert [m["month"] for m in t] == ["2025-11", "2025-12", "2026-01"]
    assert [m["expense"] for m in t] == [0, 100, 200]


def test_bad_month(client, user):
    assert client.get("/api/reports/overview", params={"month": "2026-13"}).status_code == 422


def test_budgets(client, ids):
    add_tx(client, ids, "Dining", 4000, day="2026-03-05")
    add_tx(client, ids, "Dining", 9999, day="2026-04-05")
    b = client.put("/api/budgets", json={"category_id": ids["Dining"], "amount": 30000}).json()
    client.put("/api/budgets", json={"category_id": ids["Dining"], "amount": 25000})  # upsert
    rows = client.get("/api/budgets", params={"month": "2026-03"}).json()
    assert rows == [{"id": b["id"], "category_id": ids["Dining"], "amount": 25000, "spent": 4000}]
    assert client.put("/api/budgets", json={"category_id": ids["Salary"], "amount": 1}).status_code == 422
    assert client.delete(f"/api/budgets/{b['id']}").status_code == 204
