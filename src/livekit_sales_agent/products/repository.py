from __future__ import annotations

import sqlite3
from typing import Optional
from uuid import uuid4

from livekit_sales_agent.knowledge.models import ProductRecord
from livekit_sales_agent.knowledge.repositories import _row_to_product, utc_now


class ProductRepository:
    def __init__(self, conn: sqlite3.Connection):
        self._conn = conn

    def list_products(
        self,
        *,
        query: str = "",
        category: str = "",
        brand: str = "",
        model: str = "",
        sku: str = "",
        status: str = "",
        limit: int = 200,
    ) -> list[ProductRecord]:
        normalized_query = query.strip().lower()
        clauses: list[str] = []
        params: list[object] = []

        if category.strip():
            clauses.append("LOWER(category) = LOWER(?)")
            params.append(category.strip())
        if brand.strip():
            clauses.append("LOWER(brand) = LOWER(?)")
            params.append(brand.strip())
        if model.strip():
            clauses.append("LOWER(model) = LOWER(?)")
            params.append(model.strip())
        if sku.strip():
            clauses.append("LOWER(sku) = LOWER(?)")
            params.append(sku.strip())
        if status.strip():
            clauses.append("LOWER(status) = LOWER(?)")
            params.append(status.strip())
        if normalized_query:
            like_value = f"%{normalized_query}%"
            clauses.append(
                """
                (
                    LOWER(name) LIKE ?
                    OR LOWER(category) LIKE ?
                    OR LOWER(brand) LIKE ?
                    OR LOWER(model) LIKE ?
                    OR LOWER(sku) LIKE ?
                    OR LOWER(aliases) LIKE ?
                    OR LOWER(price) LIKE ?
                    OR LOWER(summary) LIKE ?
                    OR LOWER(tags) LIKE ?
                    OR LOWER(attributes) LIKE ?
                )
                """
            )
            params.extend([like_value] * 10)

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rank_sql = "0 AS match_rank"
        rank_params: list[object] = []
        if normalized_query:
            rank_sql = """
                CASE
                    WHEN LOWER(model) = ? THEN 0
                    WHEN LOWER(sku) = ? THEN 1
                    WHEN LOWER(aliases) = ? THEN 2
                    WHEN LOWER(name) = ? THEN 3
                    WHEN LOWER(category) = ? THEN 4
                    WHEN LOWER(brand) = ? THEN 5
                    ELSE 6
                END AS match_rank
            """
            rank_params = [normalized_query] * 6

        rows = self._conn.execute(
            f"""
            SELECT
                id, name, category, brand, model, sku, aliases, price, currency, status,
                summary, tags, attributes, created_at, updated_at
            FROM (
                SELECT *, {rank_sql}
                FROM products
                {where_sql}
            )
            ORDER BY match_rank ASC, updated_at DESC, created_at DESC
            LIMIT ?
            """,
            [*rank_params, *params, max(1, min(limit, 500))],
        ).fetchall()
        return [_row_to_product(row) for row in rows]

    def get_product(self, product_id: str) -> Optional[ProductRecord]:
        row = self._conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
        return _row_to_product(row) if row else None

    def create_product(
        self,
        *,
        name: str,
        category: str,
        brand: str,
        model: str,
        sku: str,
        aliases: str,
        price: str,
        currency: str,
        status: str,
        summary: str,
        tags: str,
        attributes: str,
    ) -> ProductRecord:
        record_id = str(uuid4())
        now = utc_now()
        self._conn.execute(
            """
            INSERT INTO products (
                id, name, category, brand, model, sku, aliases, price, currency, status,
                summary, tags, attributes, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record_id,
                name,
                category,
                brand,
                model,
                sku,
                aliases,
                price,
                currency,
                status,
                summary,
                tags,
                attributes,
                now,
                now,
            ),
        )
        record = self.get_product(record_id)
        assert record is not None
        return record

    def update_product(
        self,
        product_id: str,
        *,
        name: str,
        category: str,
        brand: str,
        model: str,
        sku: str,
        aliases: str,
        price: str,
        currency: str,
        status: str,
        summary: str,
        tags: str,
        attributes: str,
    ) -> Optional[ProductRecord]:
        existing = self.get_product(product_id)
        if existing is None:
            return None

        now = utc_now()
        self._conn.execute(
            """
            UPDATE products
            SET name = ?, category = ?, brand = ?, model = ?, sku = ?, aliases = ?,
                price = ?, currency = ?, status = ?, summary = ?, tags = ?, attributes = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                name,
                category,
                brand,
                model,
                sku,
                aliases,
                price,
                currency,
                status,
                summary,
                tags,
                attributes,
                now,
                product_id,
            ),
        )
        return self.get_product(product_id)

    def delete_product(self, product_id: str) -> bool:
        cursor = self._conn.execute("DELETE FROM products WHERE id = ?", (product_id,))
        return cursor.rowcount > 0
