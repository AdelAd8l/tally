from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Category, Transaction, User
from ..schemas import CategoryIn, CategoryOut
from ..security import current_user
from .deps import get_owned

router = APIRouter(prefix="/api/categories", tags=["categories"])

DUPLICATE = "A category with this name already exists"


@router.get("", response_model=list[CategoryOut])
def list_categories(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(Category).where(Category.user_id == user.id).order_by(Category.kind, Category.name)
    ).all()


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(data: CategoryIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    category = Category(user_id=user.id, **data.model_dump())
    db.add(category)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, DUPLICATE) from None
    return category


@router.put("/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int, data: CategoryIn, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    category = get_owned(db, Category, category_id, user)
    if data.kind != category.kind:
        used = db.scalar(select(Transaction.id).where(Transaction.category_id == category.id).limit(1))
        if used:
            raise HTTPException(409, "Can't change the type of a category that has transactions")
    for field, value in data.model_dump().items():
        setattr(category, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, DUPLICATE) from None
    return category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    # Transactions keep their data and become "Uncategorized" (ON DELETE SET NULL).
    db.delete(get_owned(db, Category, category_id, user))
    db.commit()
