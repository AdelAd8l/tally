"""Tiny forward-only schema upgrades.

`create_all` creates missing tables but never adds columns to existing ones, so databases
created by an earlier version would miss new fields. Each entry here adds one column if
it isn't there yet. Safe to run on every start, on SQLite and Postgres.
"""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

# table, column, SQL type + default
COLUMNS = [
    ("users", "timezone", "VARCHAR(64) NOT NULL DEFAULT 'Africa/Cairo'"),
    ("users", "lang", "VARCHAR(2) NOT NULL DEFAULT 'en'"),
    ("users", "timezone_auto", "BOOLEAN NOT NULL DEFAULT TRUE"),
    ("users", "google_sub", "VARCHAR(255)"),
    ("users", "notify_budgets", "BOOLEAN NOT NULL DEFAULT TRUE"),
    ("users", "daily_reminder", "BOOLEAN NOT NULL DEFAULT TRUE"),
    ("users", "daily_time", "VARCHAR(5) NOT NULL DEFAULT '21:00'"),
    ("users", "monthly_summary", "BOOLEAN NOT NULL DEFAULT TRUE"),
    ("users", "is_admin", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("users", "must_change_password", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("users", "session_version", "INTEGER NOT NULL DEFAULT 0"),
]


def upgrade(engine: Engine) -> list[str]:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    added = []
    with engine.begin() as conn:
        for table, column, ddl in COLUMNS:
            if table not in tables:
                continue
            existing = {c["name"] for c in inspector.get_columns(table)}
            if column not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
                added.append(f"{table}.{column}")
    return added
