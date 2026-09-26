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


def test_insights(client, ids, monkeypatch):
    from datetime import date

    from app.routers import reports

    monkeypatch.setattr(reports, "_today", lambda user: date(2026, 3, 10))  # a Tuesday
    card = client.post("/api/accounts", json={"name": "Card", "kind": "credit", "opening_balance": 0}).json()
    add_tx(client, ids, "Salary", 500000, kind="income", day="2026-01-01")
    add_tx(client, ids, "Groceries", 20000, day="2026-01-15")
    add_tx(client, ids, "Dining", 3000, day="2026-02-02")  # a Monday
    add_tx(client, ids, "Dining", 1000, day="2026-02-27")
    add_tx(client, ids, "Groceries", 4000, day="2026-03-02")  # a Monday
    add_tx(client, ids, None, 600, day="2026-03-09")  # uncategorized, a Monday
    r = client.post("/api/transactions", json={
        "account_id": card["id"], "category_id": ids["Dining"], "kind": "expense",
        "amount": 900, "occurred_on": "2026-03-03", "note": "",
    })
    assert r.status_code == 201

    got = client.get("/api/reports/insights", params={"end": "2026-03", "months": 2}).json()
    # January is before the range: it only counts toward the starting net worth (480000)
    assert [(m["month"], m["income"], m["expense"], m["net_worth"]) for m in got["months"]] == [
        ("2026-02", 0, 4000, 476000),
        ("2026-03", 0, 5500, 470500),
    ]
    assert {(c["month"], c["category_id"], c["amount"]) for c in got["categories"]} == {
        ("2026-02", ids["Dining"], 4000),
        ("2026-03", ids["Groceries"], 4000),
        ("2026-03", ids["Dining"], 900),
        ("2026-03", None, 600),
    }
    by_account = {a["account_id"]: (a["income"], a["expense"]) for a in got["accounts"]}
    assert by_account == {ids["account"]: (0, 8600), card["id"]: (0, 900)}
    # Mondays from Feb 1 to Mar 10: Feb 2, 9, 16, 23, Mar 2, 9 -> 6; spent 3000 + 4000 + 600
    assert got["weekdays"][0] == round(7600 / 6)
    pace = got["pace"]
    assert (pace["month"], pace["days"], len(pace["current"]), len(pace["previous"])) == ("2026-03", 31, 10, 28)
    assert pace["current"][1] == 4000 and pace["current"][-1] == 5500
    assert pace["previous"][0] == 0 and pace["previous"][1] == 3000 and pace["previous"][-1] == 4000


def test_insights_for_a_future_month_has_no_pace_yet(client, ids):
    got = client.get("/api/reports/insights", params={"end": "2999-01", "months": 1}).json()
    assert got["pace"]["current"] == [] and got["weekdays"] == [0] * 7
