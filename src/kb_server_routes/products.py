from __future__ import annotations

from fastapi import FastAPI, HTTPException

from kb_server_schemas import ProductCatalogPayload, ResolveProductPricePayload
from livekit_sales_agent.products import ProductService


def register_product_routes(app: FastAPI, *, product_service: ProductService) -> None:
    @app.get("/products")
    def list_products(
        query: str = "",
        category: str = "",
        brand: str = "",
        status: str = "",
        limit: int = 200,
    ):
        return product_service.list_products(
            query=query,
            category=category,
            brand=brand,
            status=status,
            limit=limit,
        )

    @app.get("/products/{product_id}/catalog-view")
    def get_product_catalog(product_id: str):
        record = product_service.get_product_catalog(product_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Product not found")
        return record

    @app.post("/products")
    def create_product(payload: ProductCatalogPayload):
        try:
            return product_service.create_product_catalog(**payload.model_dump())
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.patch("/products/{product_id}")
    def update_product(product_id: str, payload: ProductCatalogPayload):
        try:
            record = product_service.update_product_catalog(product_id, **payload.model_dump())
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if record is None:
            raise HTTPException(status_code=404, detail="Product not found")
        return record

    @app.delete("/products/{product_id}")
    def delete_product(product_id: str):
        deleted = product_service.delete_product(product_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Product not found")
        return {"ok": True}

    @app.post("/products/{product_id}/resolve-price")
    def resolve_product_price(product_id: str, payload: ResolveProductPricePayload):
        result = product_service.resolve_price(product_id, **payload.model_dump())
        if result is None:
            raise HTTPException(status_code=404, detail="Product not found")
        return result
