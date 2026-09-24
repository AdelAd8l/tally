"""Starter data given to every new user."""

from sqlalchemy.orm import Session

from .models import Account, Category, User

EXPENSE_CATEGORIES = [
    ("Groceries", "#5B8C5A"),
    ("Dining", "#C0784A"),
    ("Housing", "#4F6D8F"),
    ("Utilities", "#7A8B99"),
    ("Transport", "#B89B4A"),
    ("Health", "#A0525B"),
    ("Shopping", "#8A6FA0"),
    ("Entertainment", "#4A9A9A"),
    ("Education", "#6B7B4A"),
    ("Other", "#8A8F98"),
]

INCOME_CATEGORIES = [
    ("Salary", "#3F7D5C"),
    ("Freelance", "#5A7FA8"),
    ("Other income", "#8A8F98"),
]


def create_starter_data(db: Session, user: User) -> None:
    db.add(Account(user=user, name="Main account", kind="checking", opening_balance=0))
    for name, color in EXPENSE_CATEGORIES:
        db.add(Category(user=user, name=name, kind="expense", color=color))
    for name, color in INCOME_CATEGORIES:
        db.add(Category(user=user, name=name, kind="income", color=color))
