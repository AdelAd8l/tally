"""Create a demo user with six months of realistic data.

    python -m app.seed            # demo@tally.dev / demo-password
"""

import random
from datetime import date, timedelta

from sqlalchemy import select

from .database import Base, SessionLocal, engine
from .defaults import create_starter_data
from .models import Account, Budget, Category, Transaction, User, delete_user
from .security import hash_password

DEMO_EMAIL = "demo@tally.dev"
DEMO_PASSWORD = "demo-password"

# category -> (min, max) in dollars, probability per day, notes
DAILY = {
    "Groceries": ((12, 95), 0.35, ["Trader Joe's", "Farmers market", "Corner store", "Whole Foods"]),
    "Dining": ((9, 58), 0.3, ["Lunch with Sam", "Pho place", "Coffee", "Pizza night", "Brunch"]),
    "Transport": ((3, 30), 0.3, ["Metro card", "Uber", "Gas", "Parking"]),
    "Shopping": ((18, 140), 0.06, ["New shoes", "Desk lamp", "Birthday gift", "Books"]),
    "Entertainment": ((8, 45), 0.08, ["Movie tickets", "Concert", "Bowling"]),
    "Health": ((15, 90), 0.03, ["Pharmacy", "Dentist copay"]),
}
MONTHLY = [
    (1, "Housing", 1450_00, "Rent"),
    (3, "Utilities", 64_00, "Electricity"),
    (8, "Utilities", 55_00, "Internet"),
    (12, "Entertainment", 15_99, "Spotify + Netflix"),
    (20, "Health", 45_00, "Gym membership"),
]
BUDGETS = {"Groceries": 450_00, "Dining": 300_00, "Transport": 180_00, "Shopping": 200_00, "Entertainment": 120_00}


def run(days: int = 180, seed: int = 7, only_if_missing: bool = False) -> None:
    Base.metadata.create_all(engine)
    rng = random.Random(seed)
    with SessionLocal() as db:
        existing = db.scalar(select(User).where(User.email == DEMO_EMAIL))
        if existing and only_if_missing:
            return
        if existing:
            delete_user(db, existing)

        user = User(email=DEMO_EMAIL, name="Alex Morgan", password_hash=hash_password(DEMO_PASSWORD))
        db.add(user)
        create_starter_data(db, user)
        db.flush()

        checking = db.scalar(select(Account).where(Account.user_id == user.id))
        checking.name, checking.opening_balance = "Checking", 2_400_00
        card = Account(user_id=user.id, name="Credit card", kind="credit", opening_balance=0)
        savings = Account(user_id=user.id, name="Savings", kind="savings", opening_balance=8_000_00)
        db.add_all([card, savings])
        db.flush()

        cats = {c.name: c for c in db.scalars(select(Category).where(Category.user_id == user.id))}

        def add(day, cat, amount, note, account, kind="expense"):
            db.add(Transaction(user_id=user.id, account_id=account.id, category_id=cats[cat].id,
                               kind=kind, amount=amount, occurred_on=day, note=note))

        today = date.today()
        for offset in range(days, -1, -1):
            day = today - timedelta(days=offset)
            if day.day in (1, 15):
                add(day, "Salary", 2_650_00, "Paycheck", checking, "income")
            if day.day == 22 and rng.random() < 0.6:
                add(day, "Freelance", rng.randint(300, 900) * 100, "Client project", checking, "income")
            for dom, cat, amount, note in MONTHLY:
                if day.day == dom:
                    add(day, cat, amount, note, checking)
            for cat, ((low, high), prob, notes) in DAILY.items():
                if rng.random() < prob:
                    account = card if rng.random() < 0.6 else checking
                    add(day, cat, rng.randint(low * 100, high * 100), rng.choice(notes), account)

        for name, amount in BUDGETS.items():
            db.add(Budget(user_id=user.id, category_id=cats[name].id, amount=amount))
        db.commit()
    print(f"Demo user ready: {DEMO_EMAIL} / {DEMO_PASSWORD}")


if __name__ == "__main__":
    run()
