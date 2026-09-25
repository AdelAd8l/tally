"""Database models. All money is stored as integer cents."""

from datetime import UTC, date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    delete,
)
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
    # Notifications: sent in the user's time zone and language.
    timezone: Mapped[str] = mapped_column(String(64), default="Africa/Cairo")
    lang: Mapped[str] = mapped_column(String(2), default="en")
    notify_budgets: Mapped[bool] = mapped_column(Boolean, default=True)  # at 80% and 100% of a budget
    daily_reminder: Mapped[bool] = mapped_column(Boolean, default=True)  # if nothing was logged today
    daily_time: Mapped[str] = mapped_column(String(5), default="21:00")
    monthly_summary: Mapped[bool] = mapped_column(Boolean, default=True)  # on the 1st, about last month
    # Admin: can see, edit and delete every account (Admin page).
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    # Set for the first admin sign-in and after an admin resets a password.
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    # Bumped when the password changes, so sessions signed with the old one stop working.
    session_version: Mapped[int] = mapped_column(Integer, default=0)
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


def _user_fk():
    return mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)


class PushSubscription(Base):
    """One browser/phone that agreed to receive notifications (Web Push)."""

    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _user_fk()
    endpoint: Mapped[str] = mapped_column(String(1000), unique=True)
    p256dh: Mapped[str] = mapped_column(String(200))
    auth: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class SentNotice(Base):
    """Remembers which notifications went out, so each is sent once (even with several workers)."""

    __tablename__ = "sent_notices"
    __table_args__ = (UniqueConstraint("user_id", "key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _user_fk()
    key: Mapped[str] = mapped_column(String(80))
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class AppKey(Base):
    """Server-wide secrets generated on first use (the VAPID key pair for Web Push)."""

    __tablename__ = "app_keys"

    name: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[str] = mapped_column(Text)


def delete_user(db: Session, user: User) -> None:
    """Remove a user and all their data.

    Transactions go first: they reference accounts with ON DELETE RESTRICT, which is what
    stops a single account with history from being deleted by accident.
    """
    db.execute(delete(Transaction).where(Transaction.user_id == user.id))
    db.execute(delete(Budget).where(Budget.user_id == user.id))
    db.execute(delete(PushSubscription).where(PushSubscription.user_id == user.id))
    db.execute(delete(SentNotice).where(SentNotice.user_id == user.id))
    db.delete(user)
    db.commit()
