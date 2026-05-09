from __future__ import annotations

import sqlite3
from pathlib import Path

from .schema import SCHEMA_STATEMENTS


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def ensure_database(db_path: Path) -> None:
    conn = connect(db_path)
    try:
        for statement in SCHEMA_STATEMENTS:
            conn.execute(statement)
        _run_migrations(conn)
        conn.commit()
    finally:
        conn.close()


def _run_migrations(conn: sqlite3.Connection) -> None:
    _ensure_column(
        conn,
        table_name="kb_chunks",
        column_name="category_id",
        column_sql="TEXT",
    )


def _ensure_column(
    conn: sqlite3.Connection,
    *,
    table_name: str,
    column_name: str,
    column_sql: str,
) -> None:
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    existing = {row["name"] for row in rows}
    if column_name in existing:
        return
    conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}")
