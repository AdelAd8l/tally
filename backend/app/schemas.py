"""Request/response models. Amounts are integer cents throughout the API."""

from datetime import date
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Kind = Literal["expense", "income"]
Lang = Literal["en", "ar"]
AccountKind = Literal["checking", "savings", "cash", "credit"]
HexColor = Field(pattern=r"^#[0-9A-Fa-f]{6}$")


def check_timezone(v: str | None) -> str | None:
    """An IANA zone like Africa/Cairo or Asia/Dubai (what notifications are timed in)."""
    if v is None:
        return v
    try:
        ZoneInfo(v)
    except (ZoneInfoNotFoundError, ValueError):
        raise ValueError("Unknown time zone") from None
    return v


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- auth / user -------------------------------------------------------------


class RegisterIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=8, max_length=128)
    currency: str = Field(default="USD", pattern=r"^[A-Z]{3}$")
    # The phone's time zone at sign-up; changed later only from Settings.
    timezone: str | None = Field(default=None, max_length=64)

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, v: str | None) -> str | None:
        return check_timezone(v)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(ORM):
    id: int
    email: str
    name: str
    currency: str
    is_admin: bool
    must_change_password: bool
    timezone: str
    timezone_auto: bool
    lang: Lang
    notify_budgets: bool
    daily_reminder: bool
    daily_time: str
    monthly_summary: bool


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    timezone: str | None = Field(default=None, max_length=64)
    timezone_auto: bool | None = None
    lang: Lang | None = None
    notify_budgets: bool | None = None
    daily_reminder: bool | None = None
    daily_time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    monthly_summary: bool | None = None

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, v: str | None) -> str | None:
        return check_timezone(v)
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Unknown time zone") from None
        return v


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


# ---- accounts ------------------------------------------------------------------


class AccountIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    kind: AccountKind = "checking"
    opening_balance: int = 0


class AccountOut(ORM):
    id: int
    name: str
    kind: AccountKind
    opening_balance: int
    balance: int = 0


# ---- categories ----------------------------------------------------------------


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    kind: Kind
    color: str = HexColor

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name cannot be blank")
        return v


class CategoryOut(ORM):
    id: int
    name: str
    kind: Kind
    color: str


# ---- transactions --------------------------------------------------------------


class TransactionIn(BaseModel):
    account_id: int
    category_id: int | None = None
    kind: Kind
    amount: int = Field(gt=0, le=10**11)
    occurred_on: date
    note: str = Field(default="", max_length=200)


class TransactionOut(ORM):
    id: int
    account_id: int
    category_id: int | None
    kind: Kind
    amount: int
    occurred_on: date
    note: str


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total: int
    income: int
    expense: int


class ImportResult(BaseModel):
    imported: int
    created_categories: list[str]


# ---- budgets -------------------------------------------------------------------


class BudgetIn(BaseModel):
    category_id: int
    amount: int = Field(gt=0, le=10**11)


class BudgetOut(BaseModel):
    id: int
    category_id: int
    amount: int
    spent: int


# ---- reports -------------------------------------------------------------------


class CategoryTotal(BaseModel):
    category_id: int | None
    amount: int


class DayTotal(BaseModel):
    day: date
    expense: int


class Overview(BaseModel):
    month: str
    income: int
    expense: int
    previous_income: int
    previous_expense: int
    net_worth: int
    by_category: list[CategoryTotal]
    daily: list[DayTotal]


class MonthTotal(BaseModel):
    month: str
    income: int
    expense: int
