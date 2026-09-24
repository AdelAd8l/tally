from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Budget, Category, Transaction, User
from ..months import month_bounds, parse_month
from ..schemas import BudgetIn, BudgetOut
from ..security import current_user
from .deps import get_owned

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


@router.get("", response_model=list[BudgetOut])
def list_budgets(month: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    start, end = month_bounds(parse_month(month))
    spent = dict(
        db.execute(
            select(Transaction.category_id, func.sum(Transaction.amount))
            .where(
                Transaction.user_id == user.id,
                Transaction.kind == "expense",
                Transaction.occurred_on.between(start, end),
            )
            .group_by(Transaction.category_id)
        ).all()
    )
    budgets = db.scalars(select(Budget).where(Budget.user_id == user.id).order_by(Budget.id))
    return [
        BudgetOut(id=b.id, category_id=b.category_id, amount=b.amount, spent=int(spent.get(b.category_id, 0)))
        for b in budgets
    ]


@router.put("", response_model=BudgetOut)
def upsert_budget(data: BudgetIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    category = get_owned(db, Category, data.category_id, user)
    if category.kind != "expense":
        raise HTTPException(422, "Budgets can only be set on expense categories")
    budget = db.scalar(select(Budget).where(Budget.user_id == user.id, Budget.category_id == category.id))
    if budget is None:
        budget = Budget(user_id=user.id, category_id=category.id, amount=data.amount)
        db.add(budget)
    else:
        budget.amount = data.amount
    db.commit()
    return BudgetOut(id=budget.id, category_id=budget.category_id, amount=budget.amount, spent=0)


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(budget_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(get_owned(db, Budget, budget_id, user))
    db.commit()
