import csv
import io
from datetime import date
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Account, Category, Transaction, User
from ..schemas import ImportResult, TransactionIn, TransactionOut, TransactionPage
from ..security import current_user
from .deps import get_owned

router = APIRouter(prefix="/api/transactions", tags=["transactions"])

MAX_IMPORT_BYTES = 2 * 1024 * 1024


def validate_refs(db: Session, user: User, data: TransactionIn) -> None:
    get_owned(db, Account, data.account_id, user)
    if data.category_id is not None:
        category = get_owned(db, Category, data.category_id, user)
        if category.kind != data.kind:
            raise HTTPException(422, f"'{category.name}' is an {category.kind} category")


def filtered(
    user: User,
    start: date | None,
    end: date | None,
    account_id: int | None,
    category_id: int | None,
    kind: str | None,
    q: str | None,
):
    stmt = select(Transaction).where(Transaction.user_id == user.id)
    if start:
        stmt = stmt.where(Transaction.occurred_on >= start)
    if end:
        stmt = stmt.where(Transaction.occurred_on <= end)
    if account_id:
        stmt = stmt.where(Transaction.account_id == account_id)
    if category_id == 0:
        stmt = stmt.where(Transaction.category_id.is_(None))
    elif category_id:
        stmt = stmt.where(Transaction.category_id == category_id)
    if kind:
        stmt = stmt.where(Transaction.kind == kind)
    if q:
        pattern = f"%{q.strip()}%"
        matching_categories = select(Category.id).where(
            Category.user_id == user.id, Category.name.ilike(pattern)
        )
        stmt = stmt.where(or_(Transaction.note.ilike(pattern), Transaction.category_id.in_(matching_categories)))
    return stmt


@router.get("", response_model=TransactionPage)
def list_transactions(
    start: date | None = None,
    end: date | None = None,
    account_id: int | None = None,
    category_id: int | None = Query(default=None, description="0 = uncategorized"),
    kind: str | None = Query(default=None, pattern="^(expense|income)$"),
    q: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    stmt = filtered(user, start, end, account_id, category_id, kind, q)
    sub = stmt.subquery()
    total, income, expense = db.execute(
        select(
            func.count(),
            func.coalesce(func.sum(case((sub.c.kind == "income", sub.c.amount))), 0),
            func.coalesce(func.sum(case((sub.c.kind == "expense", sub.c.amount))), 0),
        ).select_from(sub)
    ).one()
    items = db.scalars(
        stmt.order_by(Transaction.occurred_on.desc(), Transaction.id.desc()).limit(limit).offset(offset)
    ).all()
    return TransactionPage(items=items, total=total, income=income, expense=expense)


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(data: TransactionIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    validate_refs(db, user, data)
    tx = Transaction(user_id=user.id, **data.model_dump())
    tx.note = tx.note.strip()
    db.add(tx)
    db.commit()
    return tx


@router.put("/{tx_id}", response_model=TransactionOut)
def update_transaction(
    tx_id: int, data: TransactionIn, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    tx = get_owned(db, Transaction, tx_id, user)
    validate_refs(db, user, data)
    for field, value in data.model_dump().items():
        setattr(tx, field, value)
    tx.note = tx.note.strip()
    db.commit()
    return tx


@router.delete("/{tx_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(tx_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(get_owned(db, Transaction, tx_id, user))
    db.commit()


# ---- CSV -----------------------------------------------------------------------


def cents_to_str(cents: int) -> str:
    return f"{Decimal(cents) / 100:.2f}"


def parse_amount(raw: str) -> int:
    cleaned = raw.strip().replace(",", "").replace(" ", "")
    for symbol in "$€£¥":
        cleaned = cleaned.replace(symbol, "")
    try:
        value = Decimal(cleaned)
    except InvalidOperation:
        raise ValueError(f"'{raw}' is not a number") from None
    return int((value * 100).to_integral_value())


@router.get("/export")
def export_csv(
    start: date | None = None,
    end: date | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    accounts = {a.id: a.name for a in db.scalars(select(Account).where(Account.user_id == user.id))}
    categories = {c.id: c.name for c in db.scalars(select(Category).where(Category.user_id == user.id))}
    rows = db.scalars(
        filtered(user, start, end, None, None, None, None).order_by(Transaction.occurred_on, Transaction.id)
    )

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["date", "kind", "amount", "account", "category", "note"])
    for tx in rows:
        writer.writerow(
            [
                tx.occurred_on.isoformat(),
                tx.kind,
                cents_to_str(tx.amount),
                accounts.get(tx.account_id, ""),
                categories.get(tx.category_id, ""),
                tx.note,
            ]
        )
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="tally-transactions.csv"'},
    )


@router.post("/import", response_model=ImportResult)
async def import_csv(
    account_id: int = Form(...),
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Import rows with columns: date, amount, [kind], [category], [note].

    Without a `kind` column the sign decides: negative amounts are expenses.
    Unknown categories are created on the fly.
    """
    get_owned(db, Account, account_id, user)
    raw = await file.read(MAX_IMPORT_BYTES + 1)
    if len(raw) > MAX_IMPORT_BYTES:
        raise HTTPException(413, "File is larger than 2 MB")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(422, "File must be UTF-8 encoded CSV") from None

    reader = csv.DictReader(io.StringIO(text))
    headers = {(h or "").strip().lower() for h in reader.fieldnames or []}
    if not {"date", "amount"} <= headers:
        raise HTTPException(422, "CSV needs at least 'date' and 'amount' columns")

    categories = {
        (c.name.lower(), c.kind): c for c in db.scalars(select(Category).where(Category.user_id == user.id))
    }
    created: list[str] = []
    imported = 0
    for line_no, row in enumerate(reader, start=2):
        row = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
        try:
            occurred_on = date.fromisoformat(row["date"])
            amount = parse_amount(row["amount"])
        except ValueError as exc:
            db.rollback()
            raise HTTPException(422, f"Line {line_no}: {exc}") from None
        if amount == 0:
            continue
        kind = row.get("kind", "").lower()
        if kind not in ("expense", "income"):
            kind = "expense" if amount < 0 else "income"

        category = None
        name = row.get("category", "")
        if name:
            category = categories.get((name.lower(), kind))
            if category is None:
                category = Category(user_id=user.id, name=name[:40], kind=kind)
                db.add(category)
                db.flush()
                categories[(name.lower(), kind)] = category
                created.append(name)

        db.add(
            Transaction(
                user_id=user.id,
                account_id=account_id,
                category_id=category.id if category else None,
                kind=kind,
                amount=abs(amount),
                occurred_on=occurred_on,
                note=row.get("note", row.get("description", ""))[:200],
            )
        )
        imported += 1
    db.commit()
    return ImportResult(imported=imported, created_categories=created)
