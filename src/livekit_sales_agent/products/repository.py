from __future__ import annotations

import sqlite3
from collections import defaultdict
from dataclasses import fields
from typing import Any, Optional
from uuid import uuid4

from livekit_sales_agent.knowledge.models import (
    PriceBookRecord,
    ProductCatalogRecord,
    ProductListItemRecord,
    ProductRecord,
    ProductSpecDimensionOptionRecord,
    ProductSpecDimensionRecord,
    ProductVariantPriceRecord,
    ProductVariantRecord,
    ProductVariantSpecValueRecord,
)
from livekit_sales_agent.knowledge.repositories import utc_now


def _row_to_dataclass(row: sqlite3.Row, cls: type[Any]):
    allowed_fields = {field.name for field in fields(cls)}
    values = {key: value for key, value in dict(row).items() if key in allowed_fields}
    return cls(**values)


def _coerce_display_value(spec: dict[str, Any], option_label: str = "") -> str:
    if str(spec.get("value_display") or "").strip():
        return str(spec.get("value_display")).strip()
    if option_label:
        return option_label
    if str(spec.get("value_text") or "").strip():
        return str(spec.get("value_text")).strip()
    value_number = spec.get("value_number")
    if value_number is not None:
        return str(value_number)
    return ""


def build_spec_signature(specs: list[dict[str, Any]]) -> str:
    if not specs:
        return "__default__"
    normalized_parts: list[str] = []
    for spec in specs:
        dimension_key = str(spec.get("dimension_key") or "").strip().lower()
        if not dimension_key:
            continue
        if str(spec.get("option_key") or "").strip():
            raw_value = str(spec.get("option_key")).strip().lower()
        elif str(spec.get("value_text") or "").strip():
            raw_value = str(spec.get("value_text")).strip().lower()
        elif spec.get("value_number") is not None:
            raw_value = str(spec.get("value_number")).strip().lower()
        else:
            raw_value = str(spec.get("value_display") or "").strip().lower()
        normalized_parts.append(f"{dimension_key}={raw_value}")
    if not normalized_parts:
        return "__default__"
    return "|".join(sorted(normalized_parts))


class ProductRepository:
    def __init__(self, conn: sqlite3.Connection):
        self._conn = conn

    def list_products(
        self,
        *,
        query: str = "",
        category: str = "",
        brand: str = "",
        status: str = "",
        limit: int = 200,
    ) -> list[ProductListItemRecord]:
        normalized_query = query.strip().lower()
        clauses = ["1 = 1"]
        params: list[object] = []

        if category.strip():
            clauses.append("LOWER(p.category) = LOWER(?)")
            params.append(category.strip())
        if brand.strip():
            clauses.append("LOWER(p.brand) = LOWER(?)")
            params.append(brand.strip())
        if status.strip():
            clauses.append("LOWER(p.status) = LOWER(?)")
            params.append(status.strip())
        if normalized_query:
            like_value = f"%{normalized_query}%"
            clauses.append(
                """
                (
                    LOWER(p.name) LIKE ?
                    OR LOWER(p.category) LIKE ?
                    OR LOWER(p.brand) LIKE ?
                    OR LOWER(p.model) LIKE ?
                    OR LOWER(p.aliases) LIKE ?
                    OR LOWER(p.summary) LIKE ?
                    OR LOWER(p.tags) LIKE ?
                    OR LOWER(p.attributes) LIKE ?
                    OR EXISTS (
                        SELECT 1
                        FROM product_variants pv
                        WHERE pv.product_id = p.id AND LOWER(pv.sku) LIKE ?
                    )
                    OR EXISTS (
                        SELECT 1
                        FROM product_variants pv
                        JOIN product_variant_spec_values psv ON psv.variant_id = pv.id
                        WHERE pv.product_id = p.id
                          AND (
                            LOWER(psv.value_display) LIKE ?
                            OR LOWER(psv.value_text) LIKE ?
                          )
                    )
                )
                """
            )
            params.extend([like_value] * 11)

        rows = self._conn.execute(
            f"""
            SELECT
                p.id,
                p.name,
                p.category,
                p.brand,
                p.model,
                p.status,
                (
                    SELECT COUNT(*)
                    FROM product_variants pv
                    WHERE pv.product_id = p.id
                ) AS variant_count,
                (
                    SELECT COUNT(*)
                    FROM product_variants pv
                    WHERE pv.product_id = p.id AND LOWER(pv.status) = 'active'
                ) AS active_variant_count,
                (
                    SELECT MIN(COALESCE(pvp.amount_minor, pvp.min_amount_minor, pvp.max_amount_minor))
                    FROM product_variant_prices pvp
                    JOIN product_variants pv ON pv.id = pvp.variant_id
                    JOIN price_books pb ON pb.id = pvp.price_book_id
                    WHERE pv.product_id = p.id
                      AND pb.code = 'standard'
                      AND pvp.pricing_mode IN ('fixed', 'range')
                ) AS min_price_minor,
                (
                    SELECT MAX(COALESCE(pvp.max_amount_minor, pvp.amount_minor, pvp.min_amount_minor))
                    FROM product_variant_prices pvp
                    JOIN product_variants pv ON pv.id = pvp.variant_id
                    JOIN price_books pb ON pb.id = pvp.price_book_id
                    WHERE pv.product_id = p.id
                      AND pb.code = 'standard'
                      AND pvp.pricing_mode IN ('fixed', 'range')
                ) AS max_price_minor,
                COALESCE(
                    (
                        SELECT pb.currency
                        FROM product_variant_prices pvp
                        JOIN product_variants pv ON pv.id = pvp.variant_id
                        JOIN price_books pb ON pb.id = pvp.price_book_id
                        WHERE pv.product_id = p.id
                        ORDER BY pb.priority ASC, pvp.updated_at DESC
                        LIMIT 1
                    ),
                    'CNY'
                ) AS currency,
                p.updated_at
            FROM products p
            WHERE {' AND '.join(clauses)}
            ORDER BY p.updated_at DESC, p.created_at DESC
            LIMIT ?
            """,
            [*params, max(1, min(limit, 500))],
        ).fetchall()
        return [_row_to_dataclass(row, ProductListItemRecord) for row in rows]

    def get_product(self, product_id: str) -> Optional[ProductRecord]:
        row = self._conn.execute(
            """
            SELECT id, name, category, brand, model, aliases, status, summary, tags, attributes, created_at, updated_at
            FROM products
            WHERE id = ?
            """,
            (product_id,),
        ).fetchone()
        return _row_to_dataclass(row, ProductRecord) if row else None

    def create_product(
        self,
        *,
        name: str,
        category: str,
        brand: str,
        model: str,
        aliases: str,
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
                id, name, category, brand, model, aliases, status, summary, tags, attributes, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record_id,
                name,
                category,
                brand,
                model,
                aliases,
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
        aliases: str,
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
            SET name = ?, category = ?, brand = ?, model = ?, aliases = ?, status = ?,
                summary = ?, tags = ?, attributes = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                name,
                category,
                brand,
                model,
                aliases,
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

    def list_price_books(self) -> list[PriceBookRecord]:
        rows = self._conn.execute(
            """
            SELECT id, code, name, currency, audience_type, priority, status, created_at, updated_at
            FROM price_books
            ORDER BY priority ASC, created_at ASC
            """
        ).fetchall()
        return [_row_to_dataclass(row, PriceBookRecord) for row in rows]

    def get_catalog(self, product_id: str) -> Optional[ProductCatalogRecord]:
        product = self.get_product(product_id)
        if product is None:
            return None

        dimensions = self._list_dimensions(product_id)
        variants = self._list_variants(product_id)
        prices = self._list_variant_prices(product_id)
        price_books = self.list_price_books()

        spec_rows = self._conn.execute(
            """
            SELECT
                psv.id,
                psv.variant_id,
                psv.dimension_id,
                d.key AS dimension_key,
                d.label AS dimension_label,
                psv.option_id,
                o.option_key AS option_key,
                psv.value_text,
                psv.value_number,
                psv.value_display,
                psv.sort_value,
                psv.created_at,
                psv.updated_at
            FROM product_variant_spec_values psv
            JOIN product_variants pv ON pv.id = psv.variant_id
            JOIN product_spec_dimensions d ON d.id = psv.dimension_id
            LEFT JOIN product_spec_dimension_options o ON o.id = psv.option_id
            WHERE pv.product_id = ?
            ORDER BY d.sort_order ASC, d.created_at ASC
            """,
            (product_id,),
        ).fetchall()

        specs_by_variant: dict[str, list[ProductVariantSpecValueRecord]] = defaultdict(list)
        for row in spec_rows:
            specs_by_variant[str(row["variant_id"])].append(
                _row_to_dataclass(row, ProductVariantSpecValueRecord)
            )

        prices_by_variant: dict[str, list[ProductVariantPriceRecord]] = defaultdict(list)
        for price in prices:
            prices_by_variant[price.variant_id].append(price)

        enriched_variants: list[ProductVariantRecord] = []
        for variant in variants:
            variant.specs = specs_by_variant.get(variant.id, [])
            variant.prices = prices_by_variant.get(variant.id, [])
            enriched_variants.append(variant)

        return ProductCatalogRecord(
            product=product,
            dimensions=dimensions,
            variants=enriched_variants,
            price_books=price_books,
        )

    def replace_catalog(
        self,
        product_id: str,
        *,
        dimensions: list[dict[str, Any]],
        variants: list[dict[str, Any]],
        prices_by_sku: dict[str, list[dict[str, Any]]],
    ) -> ProductCatalogRecord:
        self._conn.execute("DELETE FROM product_variants WHERE product_id = ?", (product_id,))
        self._conn.execute("DELETE FROM product_spec_dimensions WHERE product_id = ?", (product_id,))

        now = utc_now()
        dimension_id_by_key: dict[str, str] = {}
        option_meta_by_key: dict[tuple[str, str], tuple[str, str]] = {}

        for item in dimensions:
            dimension_id = str(uuid4())
            key = str(item.get("key") or "").strip()
            self._conn.execute(
                """
                INSERT INTO product_spec_dimensions (
                    id, product_id, key, label, value_type, unit, is_required, sort_order, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    dimension_id,
                    product_id,
                    key,
                    str(item.get("label") or "").strip(),
                    str(item.get("value_type") or "enum").strip(),
                    str(item.get("unit") or "").strip(),
                    1 if bool(item.get("is_required", True)) else 0,
                    int(item.get("sort_order") or 0),
                    now,
                    now,
                ),
            )
            dimension_id_by_key[key] = dimension_id

            for option in item.get("options") or []:
                option_id = str(uuid4())
                option_key = str(option.get("option_key") or "").strip()
                option_label = str(option.get("option_label") or "").strip()
                self._conn.execute(
                    """
                    INSERT INTO product_spec_dimension_options (
                        id, dimension_id, option_key, option_label, sort_order, is_active, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        option_id,
                        dimension_id,
                        option_key,
                        option_label,
                        int(option.get("sort_order") or 0),
                        1 if bool(option.get("is_active", True)) else 0,
                        now,
                        now,
                    ),
                )
                option_meta_by_key[(key, option_key)] = (option_id, option_label)

        price_book_map = {item.code: item for item in self.list_price_books()}
        seen_signatures: set[str] = set()
        seen_skus: set[str] = set()

        for item in variants:
            sku = str(item.get("sku") or "").strip()
            spec_items = list(item.get("specs") or [])
            spec_signature = build_spec_signature(spec_items)
            if spec_signature in seen_signatures:
                raise ValueError("同一商品下存在重复的规格组合")
            if sku in seen_skus:
                raise ValueError("同一商品下存在重复的 SKU")
            seen_signatures.add(spec_signature)
            seen_skus.add(sku)

            variant_id = str(uuid4())
            variant_name = str(item.get("variant_name") or "").strip()
            self._conn.execute(
                """
                INSERT INTO product_variants (
                    id, product_id, sku, variant_name, spec_signature, status, barcode, weight,
                    lead_time_days, is_default, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    variant_id,
                    product_id,
                    sku,
                    variant_name,
                    spec_signature,
                    str(item.get("status") or "active").strip(),
                    str(item.get("barcode") or "").strip(),
                    item.get("weight"),
                    item.get("lead_time_days"),
                    1 if bool(item.get("is_default")) else 0,
                    now,
                    now,
                ),
            )

            for spec in spec_items:
                dimension_key = str(spec.get("dimension_key") or "").strip()
                dimension_id = dimension_id_by_key.get(dimension_key)
                if dimension_id is None:
                    raise ValueError(f"规格维度不存在：{dimension_key}")
                option_key = str(spec.get("option_key") or "").strip()
                option_id = None
                option_label = ""
                if option_key:
                    option_meta = option_meta_by_key.get((dimension_key, option_key))
                    if option_meta is None:
                        raise ValueError(f"规格选项不存在：{dimension_key}/{option_key}")
                    option_id, option_label = option_meta
                value_display = _coerce_display_value(spec, option_label)
                self._conn.execute(
                    """
                    INSERT INTO product_variant_spec_values (
                        id, variant_id, dimension_id, option_id, value_text, value_number, value_display,
                        sort_value, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(uuid4()),
                        variant_id,
                        dimension_id,
                        option_id,
                        str(spec.get("value_text") or "").strip(),
                        spec.get("value_number"),
                        value_display,
                        spec.get("value_number"),
                        now,
                        now,
                    ),
                )

            for price in prices_by_sku.get(sku, []):
                price_book_code = str(price.get("price_book_code") or "standard").strip()
                price_book = price_book_map.get(price_book_code)
                if price_book is None:
                    raise ValueError(f"价格表不存在：{price_book_code}")
                self._conn.execute(
                    """
                    INSERT INTO product_variant_prices (
                        id, variant_id, price_book_id, pricing_mode, amount_minor, min_amount_minor,
                        max_amount_minor, min_qty, effective_from, effective_to, tax_included,
                        remarks, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(uuid4()),
                        variant_id,
                        price_book.id,
                        str(price.get("pricing_mode") or "fixed").strip(),
                        price.get("amount_minor"),
                        price.get("min_amount_minor"),
                        price.get("max_amount_minor"),
                        int(price.get("min_qty") or 1),
                        price.get("effective_from"),
                        price.get("effective_to"),
                        1 if bool(price.get("tax_included", True)) else 0,
                        str(price.get("remarks") or "").strip(),
                        now,
                        now,
                    ),
                )

        catalog = self.get_catalog(product_id)
        assert catalog is not None
        return catalog

    def _list_dimensions(self, product_id: str) -> list[ProductSpecDimensionRecord]:
        dimension_rows = self._conn.execute(
            """
            SELECT id, product_id, key, label, value_type, unit, is_required, sort_order, created_at, updated_at
            FROM product_spec_dimensions
            WHERE product_id = ?
            ORDER BY sort_order ASC, created_at ASC
            """,
            (product_id,),
        ).fetchall()
        option_rows = self._conn.execute(
            """
            SELECT id, dimension_id, option_key, option_label, sort_order, is_active, created_at, updated_at
            FROM product_spec_dimension_options
            WHERE dimension_id IN (
                SELECT id FROM product_spec_dimensions WHERE product_id = ?
            )
            ORDER BY sort_order ASC, created_at ASC
            """,
            (product_id,),
        ).fetchall()

        options_by_dimension: dict[str, list[ProductSpecDimensionOptionRecord]] = defaultdict(list)
        for row in option_rows:
            option = _row_to_dataclass(row, ProductSpecDimensionOptionRecord)
            options_by_dimension[option.dimension_id].append(option)

        result: list[ProductSpecDimensionRecord] = []
        for row in dimension_rows:
            dimension = _row_to_dataclass(row, ProductSpecDimensionRecord)
            dimension.options = options_by_dimension.get(dimension.id, [])
            result.append(dimension)
        return result

    def _list_variants(self, product_id: str) -> list[ProductVariantRecord]:
        rows = self._conn.execute(
            """
            SELECT
                id, product_id, sku, variant_name, spec_signature, status, barcode, weight,
                lead_time_days, is_default, created_at, updated_at
            FROM product_variants
            WHERE product_id = ?
            ORDER BY is_default DESC, updated_at DESC, created_at DESC
            """,
            (product_id,),
        ).fetchall()
        return [_row_to_dataclass(row, ProductVariantRecord) for row in rows]

    def _list_variant_prices(self, product_id: str) -> list[ProductVariantPriceRecord]:
        rows = self._conn.execute(
            """
            SELECT
                pvp.id,
                pvp.variant_id,
                pvp.price_book_id,
                pb.code AS price_book_code,
                pb.name AS price_book_name,
                pb.currency AS currency,
                pvp.pricing_mode,
                pvp.amount_minor,
                pvp.min_amount_minor,
                pvp.max_amount_minor,
                pvp.min_qty,
                pvp.effective_from,
                pvp.effective_to,
                pvp.tax_included,
                pvp.remarks,
                pvp.created_at,
                pvp.updated_at
            FROM product_variant_prices pvp
            JOIN product_variants pv ON pv.id = pvp.variant_id
            JOIN price_books pb ON pb.id = pvp.price_book_id
            WHERE pv.product_id = ?
            ORDER BY pb.priority ASC, pvp.min_qty ASC, pvp.updated_at DESC
            """,
            (product_id,),
        ).fetchall()
        return [_row_to_dataclass(row, ProductVariantPriceRecord) for row in rows]
