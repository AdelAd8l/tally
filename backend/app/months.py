"""Helpers for 'YYYY-MM' month strings."""

import re
from datetime import date, timedelta

from fastapi import HTTPException

_MONTH = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")


def parse_month(value: str) -> date:
    match = _MONTH.match(value)
    if not match:
        raise HTTPException(422, "month must look like YYYY-MM")
    return date(int(match[1]), int(match[2]), 1)


def month_bounds(first: date) -> tuple[date, date]:
    """First and last day of the month containing `first`."""
    start = first.replace(day=1)
    next_start = shift(start, 1)
    return start, next_start - timedelta(days=1)


def shift(first: date, months: int) -> date:
    index = first.year * 12 + first.month - 1 + months
    return date(index // 12, index % 12 + 1, 1)


def label(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"
