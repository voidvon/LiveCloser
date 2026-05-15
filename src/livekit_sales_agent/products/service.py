from __future__ import annotations

from pathlib import Path

from livekit_sales_agent.knowledge.db import connect, unit_of_work
from livekit_sales_agent.products.repository import ProductRepository


class ProductService:
    def __init__(self, *, db_path: Path):
        self._db_path = db_path

    @staticmethod
    def _normalize_text(value: str) -> str:
        return value.strip()

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
    ):
        with connect(self._db_path) as conn:
            repo = ProductRepository(conn)
            return repo.list_products(
                query=self._normalize_text(query),
                category=self._normalize_text(category),
                brand=self._normalize_text(brand),
                model=self._normalize_text(model),
                sku=self._normalize_text(sku),
                status=self._normalize_text(status),
                limit=limit,
            )

    def get_product(self, product_id: str):
        with connect(self._db_path) as conn:
            repo = ProductRepository(conn)
            return repo.get_product(product_id)

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
    ):
        normalized_name = name.strip()
        normalized_model = model.strip()
        normalized_sku = sku.strip()
        if not any([normalized_name, normalized_model, normalized_sku]):
            raise ValueError("名称、型号、货号至少填写一项")

        with unit_of_work(self._db_path) as conn:
            repo = ProductRepository(conn)
            if normalized_model and repo.list_products(model=normalized_model, limit=1):
                raise ValueError("产品型号不能重复")
            if normalized_sku and repo.list_products(sku=normalized_sku, limit=1):
                raise ValueError("产品货号不能重复")
            return repo.create_product(
                name=normalized_name,
                category=self._normalize_text(category),
                brand=self._normalize_text(brand),
                model=normalized_model,
                sku=normalized_sku,
                aliases=self._normalize_text(aliases),
                price=self._normalize_text(price),
                currency=self._normalize_text(currency) or "CNY",
                status=self._normalize_text(status) or "active",
                summary=self._normalize_text(summary),
                tags=self._normalize_text(tags),
                attributes=self._normalize_text(attributes),
            )

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
    ):
        normalized_name = name.strip()
        normalized_model = model.strip()
        normalized_sku = sku.strip()
        if not any([normalized_name, normalized_model, normalized_sku]):
            raise ValueError("名称、型号、货号至少填写一项")

        with unit_of_work(self._db_path) as conn:
            repo = ProductRepository(conn)
            model_duplicates = repo.list_products(model=normalized_model, limit=5) if normalized_model else []
            if any(item.id != product_id for item in model_duplicates):
                raise ValueError("产品型号不能重复")
            sku_duplicates = repo.list_products(sku=normalized_sku, limit=5) if normalized_sku else []
            if any(item.id != product_id for item in sku_duplicates):
                raise ValueError("产品货号不能重复")
            return repo.update_product(
                product_id,
                name=normalized_name,
                category=self._normalize_text(category),
                brand=self._normalize_text(brand),
                model=normalized_model,
                sku=normalized_sku,
                aliases=self._normalize_text(aliases),
                price=self._normalize_text(price),
                currency=self._normalize_text(currency) or "CNY",
                status=self._normalize_text(status) or "active",
                summary=self._normalize_text(summary),
                tags=self._normalize_text(tags),
                attributes=self._normalize_text(attributes),
            )

    def delete_product(self, product_id: str) -> bool:
        with unit_of_work(self._db_path) as conn:
            repo = ProductRepository(conn)
            return repo.delete_product(product_id)
