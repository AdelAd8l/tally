from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Account, Transaction, User
from ..months import label, month_bounds, parse_month, shift
from ..schemas import CategoryTotal, DayTotal, MonthTotal, Overview
from ..security import current_user

router = APIRouter(prefix="/api/reports", tags=["reports"])


def totals(db: Session, user: User, start: date, end: date) -> tuple[int, int]:
    income, expense = db.execute(
        select(
            func.coalesce(func.sum(case((Transaction.kind == "income", Transaction.amount))), 0),
            func.coalesce(func.sum(case((Transaction.kind == "expense", Transaction.amount))), 0),
        ).where(Transaction.user_id == user.id, Transaction.occurred_on.between(start, end))
    ).one()
    return int(income), int(expense)


@router.get("/overview", response_model=Overview)
def overview(month: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    start, end = month_bounds(parse_month(month))
    prev_start, prev_end = month_bounds(shift(start, -1))
    income, expense = totals(db, user, start, end)
    previous_income, previous_expense = totals(db, user, prev_start, prev_end)

    opening = db.scalar(
        select(func.coalesce(func.sum(Account.opening_balance), 0)).where(Account.user_id == user.id)
    )
    all_income, all_expense = totals(db, user, date.min, date.max)

    expense_in_month = (
        Transaction.user_id == user.id,
        Transaction.kind == "expense",
        Transaction.occurred_on.between(start, end),
    )
    by_category = db.execute(
        select(Transaction.category_id, func.sum(Transaction.amount).label("total"))
        .where(*expense_in_month)
        .group_by(Transaction.category_id)
        .order_by(func.sum(Transaction.amount).desc())
    ).all()
    daily = db.execute(
        select(Transaction.occurred_on, func.sum(Transaction.amount))
        .where(*expense_in_month)
        .group_by(Transaction.occurred_on)
        .order_by(Transaction.occurred_on)
    ).all()

    return Overview(
        month=label(start),
        income=income,
        expense=expense,
        previous_income=previous_income,
        previous_expense=previous_expense,
        net_worth=int(opening) + all_income - all_expense,
        by_category=[CategoryTotal(category_id=c, amount=int(a)) for c, a in by_category],
        daily=[DayTotal(day=d, expense=int(a)) for d, a in daily],
    )


@router.get("/trend", response_model=list[MonthTotal])
def trend(
    end: str,
    months: int = Query(default=6, ge=1, le=24),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    last = parse_month(end)
    out = []
    for offset in range(months - 1, -1, -1):
        first = shift(last, -offset)
        income, expense = totals(db, user, *month_bounds(first))
        out.append(MonthTotal(month=label(first), income=income, expense=expense))
    return out
