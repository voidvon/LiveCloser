from __future__ import annotations

from fastapi import FastAPI, HTTPException

from kb_server_schemas import ProductPayload
from livekit_sales_agent.products import ProductService


def register_product_routes(app: FastAPI, *, product_service: ProductService) -> None:
    @app.get("/products")
    def list_products(
        query: str = "",
        category: str = "",
        brand: str = "",
        model: str = "",
        sku: str = "",
        status: str = "",
        limit: int = 200,
    ):
        return product_service.list_products(
            query=query,
            category=category,
            brand=brand,
            model=model,
            sku=sku,
            status=status,
            limit=limit,
        )

    @app.post("/products")
    def create_product(payload: ProductPayload):
        try:
            return product_service.create_product(**payload.model_dump())
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.patch("/products/{product_id}")
    def update_product(product_id: str, payload: ProductPayload):
        try:
            record = product_service.update_product(product_id, **payload.model_dump())
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
