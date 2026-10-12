"""Per-user limits, so one account cannot fill the server's small disk and memory."""

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

MAX_ACCOUNTS = 50
MAX_CATEGORIES = 300
MAX_TRANSACTIONS = 100_000
MAX_PUSH_DEVICES = 10


def count(db: Session, model, user_id: int) -> int:
    return db.scalar(select(func.count()).select_from(model).where(model.user_id == user_id)) or 0


def room_left(db: Session, model, user_id: int, limit: int) -> int:
    return max(0, limit - count(db, model, user_id))


def ensure_room(db: Session, model, user_id: int, limit: int, what: str, adding: int = 1) -> None:
    if count(db, model, user_id) + adding > limit:
        raise HTTPException(409, f"Limit reached: at most {limit:,} {what} per account")
