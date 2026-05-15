from __future__ import annotations

import sqlite3
from pathlib import Path
from uuid import uuid4

from livekit_sales_agent.defaults import (
    DEFAULT_IDLE_GOODBYE_MESSAGE,
    DEFAULT_IDLE_REMINDER_MESSAGE,
    DEFAULT_OPENING_MESSAGE,
)

from .schema import SCHEMA_STATEMENTS


def _is_index_statement(statement: str) -> bool:
    normalized = statement.lstrip().upper()
    return normalized.startswith("CREATE INDEX") or normalized.startswith("CREATE UNIQUE INDEX")


BASE_SCHEMA_STATEMENTS = [statement for statement in SCHEMA_STATEMENTS if not _is_index_statement(statement)]
INDEX_SCHEMA_STATEMENTS = [statement for statement in SCHEMA_STATEMENTS if _is_index_statement(statement)]


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def ensure_database(db_path: Path) -> None:
    conn = connect(db_path)
    try:
        for statement in BASE_SCHEMA_STATEMENTS:
            conn.execute(statement)
        _run_migrations(conn)
        for statement in INDEX_SCHEMA_STATEMENTS:
            conn.execute(statement)
        conn.commit()
    finally:
        conn.close()


def _run_migrations(conn: sqlite3.Connection) -> None:
    _ensure_column(
        conn,
        table_name="knowledge_bases",
        column_name="embedding_profile_id",
        column_sql="TEXT",
    )
    _ensure_column(
        conn,
        table_name="kb_chunks",
        column_name="category_id",
        column_sql="TEXT",
    )
    _ensure_column(
        conn,
        table_name="chat_conversations",
        column_name="agent_profile_id",
        column_sql="TEXT",
    )
    _ensure_column(
        conn,
        table_name="chat_conversations",
        column_name="status",
        column_sql="TEXT NOT NULL DEFAULT 'active'",
    )
    _ensure_column(
        conn,
        table_name="chat_conversations",
        column_name="ended_at",
        column_sql="TEXT",
    )
    _ensure_column(
        conn,
        table_name="chat_conversations",
        column_name="end_reason",
        column_sql="TEXT NOT NULL DEFAULT ''",
    )
    _ensure_column(
        conn,
        table_name="chat_conversations",
        column_name="end_detail",
        column_sql="TEXT NOT NULL DEFAULT ''",
    )
    added_opening_message = _ensure_column(
        conn,
        table_name="agent_profiles",
        column_name="opening_message",
        column_sql="TEXT NOT NULL DEFAULT ''",
    )
    added_idle_timeout_seconds = _ensure_column(
        conn,
        table_name="agent_profiles",
        column_name="idle_timeout_seconds",
        column_sql="REAL NOT NULL DEFAULT 10.0",
    )
    added_max_idle_reminders = _ensure_column(
        conn,
        table_name="agent_profiles",
        column_name="max_idle_reminders",
        column_sql="INTEGER NOT NULL DEFAULT 1",
    )
    added_idle_reminder_message = _ensure_column(
        conn,
        table_name="agent_profiles",
        column_name="idle_reminder_message",
        column_sql="TEXT NOT NULL DEFAULT ''",
    )
    added_idle_goodbye_message = _ensure_column(
        conn,
        table_name="agent_profiles",
        column_name="idle_goodbye_message",
        column_sql="TEXT NOT NULL DEFAULT ''",
    )
    added_product_category = _ensure_column(
        conn,
        table_name="products",
        column_name="category",
        column_sql="TEXT NOT NULL DEFAULT ''",
    )
    added_product_brand = _ensure_column(
        conn,
        table_name="products",
        column_name="brand",
        column_sql="TEXT NOT NULL DEFAULT ''",
    )
    added_product_sku = _ensure_column(
        conn,
        table_name="products",
        column_name="sku",
        column_sql="TEXT NOT NULL DEFAULT ''",
    )
    added_product_aliases = _ensure_column(
        conn,
        table_name="products",
        column_name="aliases",
        column_sql="TEXT NOT NULL DEFAULT ''",
    )
    added_product_tags = _ensure_column(
        conn,
        table_name="products",
        column_name="tags",
        column_sql="TEXT NOT NULL DEFAULT ''",
    )
    added_product_attributes = _ensure_column(
        conn,
        table_name="products",
        column_name="attributes",
        column_sql="TEXT NOT NULL DEFAULT ''",
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_knowledge_bases_embedding_profile_id ON knowledge_bases(embedding_profile_id)"
    )
    _backfill_embedding_profiles(conn)
    if any(
        [
            added_product_category,
            added_product_brand,
            added_product_sku,
            added_product_aliases,
            added_product_tags,
            added_product_attributes,
        ]
    ):
        _backfill_generic_product_fields(conn)
    if added_opening_message:
        _backfill_agent_profile_opening_messages(conn)
    if added_idle_timeout_seconds or added_max_idle_reminders:
        _backfill_agent_profile_idle_thresholds(conn)
    if added_idle_reminder_message or added_idle_goodbye_message:
        _backfill_agent_profile_idle_messages(conn)


def _ensure_column(
    conn: sqlite3.Connection,
    *,
    table_name: str,
    column_name: str,
    column_sql: str,
) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    existing = {row["name"] for row in rows}
    if column_name in existing:
        return False
    conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}")
    return True


def _backfill_embedding_profiles(conn: sqlite3.Connection) -> None:
    tables = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'embedding_profiles'"
    ).fetchall()
    if not tables:
        return

    profiles = conn.execute(
        """
        SELECT id, name, provider, model, base_url, api_key_env
        FROM embedding_profiles
        """
    ).fetchall()
    profile_by_signature = {
        (
            row["provider"],
            row["model"],
            row["base_url"],
            row["api_key_env"],
        ): row["id"]
        for row in profiles
    }
    existing_names = {row["name"] for row in profiles}

    knowledge_bases = conn.execute(
        """
        SELECT
            id,
            name,
            embedding_profile_id,
            embedding_provider,
            embedding_model,
            embedding_base_url,
            embedding_api_key_env
        FROM knowledge_bases
        """
    ).fetchall()

    for kb in knowledge_bases:
        if kb["embedding_profile_id"]:
            continue

        signature = (
            kb["embedding_provider"] or "openai_compatible",
            kb["embedding_model"] or "",
            kb["embedding_base_url"] or "",
            kb["embedding_api_key_env"] or "",
        )
        if not any(signature[1:]):
            continue

        profile_id = profile_by_signature.get(signature)
        if profile_id is None:
            base_name = f"{kb['name']} Embedding".strip() or "Embedding Profile"
            profile_name = base_name
            suffix = 2
            while profile_name in existing_names:
                profile_name = f"{base_name} {suffix}"
                suffix += 1
            existing_names.add(profile_name)
            profile_id = str(uuid4())
            now = conn.execute("SELECT CURRENT_TIMESTAMP").fetchone()[0]
            conn.execute(
                """
                INSERT INTO embedding_profiles (
                    id, name, provider, model, base_url, api_key_env, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    profile_id,
                    profile_name,
                    signature[0],
                    signature[1],
                    signature[2],
                    signature[3],
                    now,
                    now,
                ),
            )
            profile_by_signature[signature] = profile_id

        conn.execute(
            "UPDATE knowledge_bases SET embedding_profile_id = ? WHERE id = ?",
            (profile_id, kb["id"]),
        )


def _backfill_generic_product_fields(conn: sqlite3.Connection) -> None:
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(products)").fetchall()}
    if not columns:
        return

    has_legacy_columns = {"product_type", "series", "alias", "pressure_range", "connection_size", "material", "application", "keywords"}.issubset(columns)
    if not has_legacy_columns:
        return

    rows = conn.execute(
        """
        SELECT
            id,
            category,
            brand,
            sku,
            aliases,
            tags,
            attributes,
            product_type,
            series,
            alias,
            pressure_range,
            connection_size,
            material,
            application,
            keywords
        FROM products
        """
    ).fetchall()

    for row in rows:
        category = row["category"] or row["product_type"] or ""
        aliases = row["aliases"] or row["alias"] or ""
        tags = row["tags"] or row["keywords"] or ""

        attribute_lines: list[str] = []
        if row["series"]:
            attribute_lines.append(f"series: {row['series']}")
        if row["pressure_range"]:
            attribute_lines.append(f"pressure_range: {row['pressure_range']}")
        if row["connection_size"]:
            attribute_lines.append(f"connection_size: {row['connection_size']}")
        if row["material"]:
            attribute_lines.append(f"material: {row['material']}")
        if row["application"]:
            attribute_lines.append(f"application: {row['application']}")

        existing_attributes = (row["attributes"] or "").strip()
        derived_attributes = "\n".join(attribute_lines).strip()
        attributes = existing_attributes or derived_attributes

        conn.execute(
            """
            UPDATE products
            SET category = ?, aliases = ?, tags = ?, attributes = ?
            WHERE id = ?
            """,
            (
                category,
                aliases,
                tags,
                attributes,
                row["id"],
            ),
        )


def _backfill_agent_profile_opening_messages(conn: sqlite3.Connection) -> None:
    conn.execute(
        "UPDATE agent_profiles SET opening_message = ? WHERE opening_message = ''",
        (DEFAULT_OPENING_MESSAGE,),
    )


def _backfill_agent_profile_idle_thresholds(conn: sqlite3.Connection) -> None:
    conn.execute(
        "UPDATE agent_profiles SET idle_timeout_seconds = 10.0 WHERE idle_timeout_seconds IS NULL",
    )
    conn.execute(
        "UPDATE agent_profiles SET max_idle_reminders = 1 WHERE max_idle_reminders IS NULL",
    )


def _backfill_agent_profile_idle_messages(conn: sqlite3.Connection) -> None:
    conn.execute(
        "UPDATE agent_profiles SET idle_reminder_message = ? WHERE idle_reminder_message = ''",
        (DEFAULT_IDLE_REMINDER_MESSAGE,),
    )
    conn.execute(
        "UPDATE agent_profiles SET idle_goodbye_message = ? WHERE idle_goodbye_message = ''",
        (DEFAULT_IDLE_GOODBYE_MESSAGE,),
    )
