from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import case, delete, func, select, update
from sqlalchemy.orm import Session

from ..database import get_db
from ..limits import MAX_ACCOUNTS, ensure_room
from ..models import Account, Transaction, User
from ..schemas import AccountIn, AccountOut, DeleteAll, Deleted
from ..security import current_user
from .deps import get_owned

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


def balances(db: Session, user: User) -> dict[int, int]:
    signed = case((Transaction.kind == "income", Transaction.amount), else_=-Transaction.amount)
    rows = db.execute(
        select(Transaction.account_id, func.sum(signed))
        .where(Transaction.user_id == user.id)
        .group_by(Transaction.account_id)
    )
    return {account_id: int(total) for account_id, total in rows}


def to_out(account: Account, movement: int) -> AccountOut:
    out = AccountOut.model_validate(account)
    out.balance = account.opening_balance + movement
    return out


@router.get("", response_model=list[AccountOut])
def list_accounts(user: User = Depends(current_user), db: Session = Depends(get_db)):
    moves = balances(db, user)
    accounts = db.scalars(select(Account).where(Account.user_id == user.id).order_by(Account.id))
    return [to_out(a, moves.get(a.id, 0)) for a in accounts]


@router.post("", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
def create_account(data: AccountIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ensure_room(db, Account, user.id, MAX_ACCOUNTS, "accounts")
    account = Account(user_id=user.id, **data.model_dump(exclude_none=True))
    db.add(account)
    db.commit()
    return to_out(account, 0)


@router.put("/{account_id}", response_model=AccountOut)
def update_account(
    account_id: int, data: AccountIn, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    account = get_owned(db, Account, account_id, user)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(account, field, value)
    db.commit()
    return to_out(account, balances(db, user).get(account.id, 0))


@router.post("/reset-all", response_model=Deleted)
def reset_all_accounts(data: DeleteAll, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Start from the beginning: every balance back to 0. Deletes all transactions and clears every opening balance.

    The accounts themselves, the categories and the budgets stay.
    """
    if not data.confirm:
        raise HTTPException(422, "Confirmation is required")
    result = db.execute(delete(Transaction).where(Transaction.user_id == user.id))
    db.execute(update(Account).where(Account.user_id == user.id).values(opening_balance=0))
    db.commit()
    return Deleted(deleted=result.rowcount or 0)


@router.post("/{account_id}/reset", response_model=AccountOut)
def reset_account(
    account_id: int, data: DeleteAll, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    """Zero one account: its balance starts again from 0 (its transactions are deleted, its opening balance cleared)."""
    if not data.confirm:
        raise HTTPException(422, "Confirmation is required")
    account = get_owned(db, Account, account_id, user)
    db.execute(delete(Transaction).where(Transaction.user_id == user.id, Transaction.account_id == account.id))
    account.opening_balance = 0
    db.commit()
    return to_out(account, 0)


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(account_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    account = get_owned(db, Account, account_id, user)
    in_use = db.scalar(select(func.count()).where(Transaction.account_id == account.id))
    if in_use:
        raise HTTPException(409, "This account has transactions. Move or delete them first.")
    if db.scalar(select(func.count()).where(Account.user_id == user.id)) <= 1:
        raise HTTPException(409, "You need at least one account.")
    db.delete(account)
    db.commit()
