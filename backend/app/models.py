"""Database models. All money is stored as integer cents."""

from datetime import UTC, date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, delete
from sqlalchemy.orm import Mapped, Session, mapped_column, relationship

from .database import Base


def _now() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(String(255))
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    accounts: Mapped[list["Account"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    categories: Mapped[list["Category"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(60))
    kind: Mapped[str] = mapped_column(String(20), default="checking")
    opening_balance: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    user: Mapped[User] = relationship(back_populates="accounts")


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("user_id", "name", "kind"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(40))
    kind: Mapped[str] = mapped_column(String(10))  # "expense" | "income"
    color: Mapped[str] = mapped_column(String(7), default="#8A8F98")

    user: Mapped[User] = relationship(back_populates="categories")


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (CheckConstraint("amount > 0", name="amount_positive"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"), index=True)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), index=True, nullable=True
    )
    kind: Mapped[str] = mapped_column(String(10))  # "expense" | "income"
    amount: Mapped[int] = mapped_column(Integer)
    occurred_on: Mapped[date] = mapped_column(Date, index=True)
    note: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Budget(Base):
    __tablename__ = "budgets"
    __table_args__ = (UniqueConstraint("user_id", "category_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"))
    amount: Mapped[int] = mapped_column(Integer)


def delete_user(db: Session, user: User) -> None:
    """Remove a user and all their data.

    Transactions go first: they reference accounts with ON DELETE RESTRICT, which is what
    stops a single account with history from being deleted by accident.
    """
    db.execute(delete(Transaction).where(Transaction.user_id == user.id))
    db.execute(delete(Budget).where(Budget.user_id == user.id))
    db.delete(user)
    db.commit()
