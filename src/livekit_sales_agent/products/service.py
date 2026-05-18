from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

from livekit_sales_agent.knowledge.db import connect, unit_of_work
from livekit_sales_agent.products.repository import ProductRepository, build_spec_signature


def _normalize_text(value: str) -> str:
    return value.strip()


def _normalize_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _normalize_spec_value(value: str) -> str:
    return value.strip().lower()


class ProductService:
    def __init__(self, *, db_path: Path):
        self._db_path = db_path

    def list_products(
        self,
        *,
        query: str = "",
        category: str = "",
        brand: str = "",
        status: str = "",
        limit: int = 200,
    ):
        with connect(self._db_path) as conn:
            repo = ProductRepository(conn)
            return repo.list_products(
                query=_normalize_text(query),
                category=_normalize_text(category),
                brand=_normalize_text(brand),
                status=_normalize_text(status),
                limit=limit,
            )

    def get_product_catalog(self, product_id: str):
        with connect(self._db_path) as conn:
            repo = ProductRepository(conn)
            return repo.get_catalog(product_id)

    def create_product_catalog(
        self,
        *,
        product: dict[str, Any],
        dimensions: list[dict[str, Any]],
        variants: list[dict[str, Any]],
        prices: dict[str, list[dict[str, Any]]],
    ):
        normalized_product = self._normalize_product(product)
        normalized_dimensions = self._normalize_dimensions(dimensions)
        normalized_variants, normalized_prices = self._normalize_variants_and_prices(
            normalized_dimensions,
            variants,
            prices,
        )

        with unit_of_work(self._db_path) as conn:
            repo = ProductRepository(conn)
            record = repo.create_product(**normalized_product)
            return repo.replace_catalog(
                record.id,
                dimensions=normalized_dimensions,
                variants=normalized_variants,
                prices_by_sku=normalized_prices,
            )

    def update_product_catalog(
        self,
        product_id: str,
        *,
        product: dict[str, Any],
        dimensions: list[dict[str, Any]],
        variants: list[dict[str, Any]],
        prices: dict[str, list[dict[str, Any]]],
    ):
        normalized_product = self._normalize_product(product)
        normalized_dimensions = self._normalize_dimensions(dimensions)
        normalized_variants, normalized_prices = self._normalize_variants_and_prices(
            normalized_dimensions,
            variants,
            prices,
        )

        with unit_of_work(self._db_path) as conn:
            repo = ProductRepository(conn)
            record = repo.update_product(product_id, **normalized_product)
            if record is None:
                return None
            return repo.replace_catalog(
                product_id,
                dimensions=normalized_dimensions,
                variants=normalized_variants,
                prices_by_sku=normalized_prices,
            )

    def delete_product(self, product_id: str) -> bool:
        with unit_of_work(self._db_path) as conn:
            repo = ProductRepository(conn)
            return repo.delete_product(product_id)

    def resolve_price(
        self,
        product_id: str,
        *,
        price_book_code: str = "standard",
        quantity: int = 1,
        effective_at: Optional[str] = None,
        specs: dict[str, str] | None = None,
    ) -> Optional[dict[str, Any]]:
        with connect(self._db_path) as conn:
            repo = ProductRepository(conn)
            catalog = repo.get_catalog(product_id)

        if catalog is None:
            return None

        specs = specs or {}
        normalized_specs = {
            _normalize_text(key): _normalize_text(value)
            for key, value in specs.items()
            if _normalize_text(key) and _normalize_text(value)
        }
        dimensions = catalog.dimensions
        dimension_by_key = {dimension.key: dimension for dimension in dimensions}
        required_dimensions = [dimension for dimension in dimensions if bool(dimension.is_required)]
        missing_dimensions = [
            dimension.label
            for dimension in required_dimensions
            if dimension.key not in normalized_specs
        ]

        candidate_variants = []
        for variant in catalog.variants:
            spec_map = self._variant_spec_map(variant)
            if all(self._matches_spec(spec_map.get(key), value) for key, value in normalized_specs.items()):
                candidate_variants.append((variant, spec_map))

        if missing_dimensions and len(catalog.variants) > 1:
            return {
                "matched": False,
                "reason": "missing_specs",
                "product_id": catalog.product.id,
                "product_name": catalog.product.name,
                "missing_dimensions": missing_dimensions,
                "available_dimensions": [dimension.label for dimension in dimensions],
            }

        if not candidate_variants:
            return {
                "matched": False,
                "reason": "variant_not_found",
                "product_id": catalog.product.id,
                "product_name": catalog.product.name,
                "available_dimensions": [dimension.label for dimension in dimensions],
            }

        if len(candidate_variants) > 1:
            return {
                "matched": False,
                "reason": "ambiguous_variant",
                "product_id": catalog.product.id,
                "product_name": catalog.product.name,
                "missing_dimensions": missing_dimensions,
                "candidate_count": len(candidate_variants),
            }

        variant, spec_map = candidate_variants[0]
        matched_price = self._select_price(
            variant.prices or [],
            price_book_code=_normalize_text(price_book_code) or "standard",
            quantity=max(1, quantity),
            effective_at=_normalize_optional_text(effective_at),
        )

        if matched_price is None:
            return {
                "matched": False,
                "reason": "price_not_found",
                "product_id": catalog.product.id,
                "product_name": catalog.product.name,
                "variant_id": variant.id,
                "sku": variant.sku,
                "specs": {key: values["display"] for key, values in spec_map.items()},
            }

        return {
            "matched": True,
            "product_id": catalog.product.id,
            "product_name": catalog.product.name,
            "variant_id": variant.id,
            "sku": variant.sku,
            "variant_name": variant.variant_name,
            "specs": {key: values["display"] for key, values in spec_map.items()},
            "price": {
                "price_book_code": matched_price.price_book_code,
                "price_book_name": matched_price.price_book_name,
                "pricing_mode": matched_price.pricing_mode,
                "amount_minor": matched_price.amount_minor,
                "min_amount_minor": matched_price.min_amount_minor,
                "max_amount_minor": matched_price.max_amount_minor,
                "currency": matched_price.currency,
                "min_qty": matched_price.min_qty,
                "remarks": matched_price.remarks,
            },
        }

    def _normalize_product(self, payload: dict[str, Any]) -> dict[str, str]:
        normalized_name = _normalize_text(str(payload.get("name") or ""))
        normalized_model = _normalize_text(str(payload.get("model") or ""))
        if not any([normalized_name, normalized_model]):
            raise ValueError("名称、型号至少填写一项")
        return {
            "name": normalized_name,
            "category": _normalize_text(str(payload.get("category") or "")),
            "brand": _normalize_text(str(payload.get("brand") or "")),
            "model": normalized_model,
            "aliases": _normalize_text(str(payload.get("aliases") or "")),
            "status": _normalize_text(str(payload.get("status") or "")) or "active",
            "summary": _normalize_text(str(payload.get("summary") or "")),
            "tags": _normalize_text(str(payload.get("tags") or "")),
            "attributes": _normalize_text(str(payload.get("attributes") or "")),
        }

    def _normalize_dimensions(self, dimensions: list[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized: list[dict[str, Any]] = []
        seen_keys: set[str] = set()

        for index, item in enumerate(dimensions):
            key = _normalize_text(str(item.get("key") or ""))
            label = _normalize_text(str(item.get("label") or ""))
            if not key or not label:
                raise ValueError("规格维度必须填写 key 和 label")
            if key in seen_keys:
                raise ValueError("规格维度 key 不能重复")
            seen_keys.add(key)

            options: list[dict[str, Any]] = []
            seen_option_keys: set[str] = set()
            for option_index, option in enumerate(item.get("options") or []):
                option_key = _normalize_text(str(option.get("option_key") or ""))
                option_label = _normalize_text(str(option.get("option_label") or ""))
                if not option_key or not option_label:
                    raise ValueError(f"规格维度 {label} 存在空选项")
                if option_key in seen_option_keys:
                    raise ValueError(f"规格维度 {label} 的选项 key 不能重复")
                seen_option_keys.add(option_key)
                options.append(
                    {
                        "option_key": option_key,
                        "option_label": option_label,
                        "sort_order": int(option.get("sort_order") or option_index),
                        "is_active": bool(option.get("is_active", True)),
                    }
                )

            value_type = _normalize_text(str(item.get("value_type") or "")) or "enum"
            if value_type == "enum" and not options:
                raise ValueError(f"枚举规格维度 {label} 至少需要一个选项")

            normalized.append(
                {
                    "key": key,
                    "label": label,
                    "value_type": value_type,
                    "unit": _normalize_text(str(item.get("unit") or "")),
                    "is_required": bool(item.get("is_required", True)),
                    "sort_order": int(item.get("sort_order") or index),
                    "options": options,
                }
            )

        return normalized

    def _normalize_variants_and_prices(
        self,
        dimensions: list[dict[str, Any]],
        variants: list[dict[str, Any]],
        prices: dict[str, list[dict[str, Any]]],
    ) -> tuple[list[dict[str, Any]], dict[str, list[dict[str, Any]]]]:
        dimension_by_key = {item["key"]: item for item in dimensions}
        normalized_variants: list[dict[str, Any]] = []
        normalized_prices: dict[str, list[dict[str, Any]]] = {}
        seen_skus: set[str] = set()
        seen_signatures: set[str] = set()
        has_default_variant = False

        for index, item in enumerate(variants):
            sku = _normalize_text(str(item.get("sku") or ""))
            if not sku:
                raise ValueError("每个变体都必须填写 SKU")
            if sku in seen_skus:
                raise ValueError("SKU 不能重复")
            seen_skus.add(sku)

            specs: list[dict[str, Any]] = []
            seen_dimension_keys: set[str] = set()
            for spec in item.get("specs") or []:
                dimension_key = _normalize_text(str(spec.get("dimension_key") or ""))
                if dimension_key not in dimension_by_key:
                    raise ValueError(f"变体 {sku} 使用了不存在的规格维度：{dimension_key}")
                if dimension_key in seen_dimension_keys:
                    raise ValueError(f"变体 {sku} 的规格维度重复：{dimension_key}")
                seen_dimension_keys.add(dimension_key)

                dimension = dimension_by_key[dimension_key]
                option_key = _normalize_text(str(spec.get("option_key") or ""))
                value_text = _normalize_text(str(spec.get("value_text") or ""))
                value_number = spec.get("value_number")
                if value_number is not None:
                    value_number = float(value_number)
                value_display = _normalize_text(str(spec.get("value_display") or ""))

                if dimension["value_type"] == "enum":
                    if not option_key:
                        raise ValueError(f"枚举规格维度 {dimension['label']} 必须填写 option_key")
                    available_option_keys = {
                        option["option_key"] for option in dimension.get("options") or []
                    }
                    if option_key not in available_option_keys:
                        raise ValueError(
                            f"变体 {sku} 的规格选项不存在：{dimension['label']} / {option_key}"
                        )
                elif not any([value_text, value_display, value_number is not None]):
                    raise ValueError(f"变体 {sku} 的规格值不能为空：{dimension['label']}")

                specs.append(
                    {
                        "dimension_key": dimension_key,
                        "option_key": option_key or None,
                        "value_text": value_text,
                        "value_number": value_number,
                        "value_display": value_display,
                    }
                )

            required_keys = {
                item["key"] for item in dimensions if bool(item.get("is_required", True))
            }
            if required_keys.difference(seen_dimension_keys):
                raise ValueError(f"变体 {sku} 缺少必填规格维度")

            spec_signature = build_spec_signature(specs)
            if spec_signature in seen_signatures:
                raise ValueError("规格组合不能重复")
            seen_signatures.add(spec_signature)

            variant_name = _normalize_text(str(item.get("variant_name") or ""))
            if not variant_name:
                variant_name = " / ".join(
                    filter(
                        None,
                        [
                            self._spec_display_value(spec, dimension_by_key[spec["dimension_key"]])
                            for spec in specs
                        ],
                    )
                )
            normalized_variant = {
                "sku": sku,
                "variant_name": variant_name or sku,
                "status": _normalize_text(str(item.get("status") or "")) or "active",
                "barcode": _normalize_text(str(item.get("barcode") or "")),
                "weight": item.get("weight"),
                "lead_time_days": item.get("lead_time_days"),
                "is_default": bool(item.get("is_default", False)),
                "specs": specs,
            }
            if normalized_variant["is_default"]:
                has_default_variant = True
            normalized_variants.append(normalized_variant)

            normalized_price_rows: list[dict[str, Any]] = []
            for price in prices.get(sku, []):
                pricing_mode = _normalize_text(str(price.get("pricing_mode") or "")) or "fixed"
                amount_minor = price.get("amount_minor")
                min_amount_minor = price.get("min_amount_minor")
                max_amount_minor = price.get("max_amount_minor")
                if pricing_mode == "fixed" and amount_minor is None:
                    raise ValueError(f"变体 {sku} 的固定价格必须填写 amount_minor")
                if pricing_mode == "range" and min_amount_minor is None and max_amount_minor is None:
                    raise ValueError(f"变体 {sku} 的区间价格必须填写最小或最大金额")
                normalized_price_rows.append(
                    {
                        "price_book_code": _normalize_text(str(price.get("price_book_code") or ""))
                        or "standard",
                        "pricing_mode": pricing_mode,
                        "amount_minor": amount_minor,
                        "min_amount_minor": min_amount_minor,
                        "max_amount_minor": max_amount_minor,
                        "min_qty": max(1, int(price.get("min_qty") or 1)),
                        "effective_from": _normalize_optional_text(price.get("effective_from")),
                        "effective_to": _normalize_optional_text(price.get("effective_to")),
                        "tax_included": bool(price.get("tax_included", True)),
                        "remarks": _normalize_text(str(price.get("remarks") or "")),
                    }
                )
            normalized_prices[sku] = normalized_price_rows

        unknown_price_skus = set(prices).difference(seen_skus)
        if unknown_price_skus:
            raise ValueError("价格数据引用了不存在的 SKU")

        if normalized_variants and not has_default_variant:
            normalized_variants[0]["is_default"] = True

        return normalized_variants, normalized_prices

    def _spec_display_value(self, spec: dict[str, Any], dimension: dict[str, Any]) -> str:
        if spec.get("value_display"):
            return str(spec["value_display"])
        option_key = spec.get("option_key")
        if option_key:
            option_map = {
                option["option_key"]: option["option_label"] for option in dimension.get("options") or []
            }
            return option_map.get(option_key, str(option_key))
        if spec.get("value_text"):
            return str(spec["value_text"])
        if spec.get("value_number") is not None:
            return f"{spec['value_number']}{dimension['unit']}" if dimension["unit"] else str(spec["value_number"])
        return ""

    def _variant_spec_map(self, variant) -> dict[str, dict[str, str]]:
        spec_map: dict[str, dict[str, str]] = {}
        for spec in variant.specs or []:
            spec_map[spec.dimension_key] = {
                "option_key": (spec.option_key or "").strip(),
                "value_text": spec.value_text.strip(),
                "display": spec.value_display.strip(),
            }
        return spec_map

    def _matches_spec(self, candidate: Optional[dict[str, str]], requested_value: str) -> bool:
        if candidate is None:
            return False
        normalized_requested = _normalize_spec_value(requested_value)
        return normalized_requested in {
            _normalize_spec_value(candidate.get("option_key") or ""),
            _normalize_spec_value(candidate.get("value_text") or ""),
            _normalize_spec_value(candidate.get("display") or ""),
        }

    def _select_price(
        self,
        prices,
        *,
        price_book_code: str,
        quantity: int,
        effective_at: Optional[str],
    ):
        candidates = [
            price
            for price in prices
            if price.price_book_code == price_book_code
            and price.min_qty <= quantity
            and (price.effective_from is None or effective_at is None or price.effective_from <= effective_at)
            and (price.effective_to is None or effective_at is None or price.effective_to >= effective_at)
        ]
        if not candidates:
            candidates = [
                price
                for price in prices
                if price.price_book_code == price_book_code and price.min_qty <= quantity
            ]
        if not candidates:
            return None
        candidates.sort(
            key=lambda item: (
                item.min_qty,
                item.effective_from or "",
                item.updated_at,
            ),
            reverse=True,
        )
        return candidates[0]
