from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from livekit_sales_agent.knowledge.db import connect, ensure_database  # noqa: E402
from livekit_sales_agent.products import ProductRepository, ProductService  # noqa: E402


class ProductCatalogTest(unittest.TestCase):
    def test_product_catalog_crud_and_search(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            db_path = root / "app.db"
            ensure_database(db_path)
            conn = connect(db_path)
            repo = ProductRepository(conn)

            first = repo.create_product(
                name="iPhone 15 Pro",
                category="手机",
                brand="Apple",
                model="A3104",
                sku="IP15PRO-256-BLK",
                aliases="iPhone 15 Pro 国行",
                price="7999 元",
                currency="CNY",
                status="active",
                summary="高端智能手机，适合影像和高性能场景。",
                tags="手机,Apple,iOS",
                attributes="color: black\nstorage: 256GB\nnetwork: 5G",
            )
            second = repo.create_product(
                name="MacBook Air 13",
                category="笔记本电脑",
                brand="Apple",
                model="MBA13-M3",
                sku="MBA13-M3-512",
                aliases="MacBook Air M3",
                price="9999 元",
                currency="CNY",
                status="active",
                summary="轻薄笔记本，适合办公和移动使用。",
                tags="电脑,Apple,macOS",
                attributes="color: silver\nmemory: 16GB\nstorage: 512GB",
            )

            all_products = repo.list_products()
            self.assertEqual(len(all_products), 2)

            category_results = repo.list_products(category="手机")
            self.assertEqual(len(category_results), 1)
            self.assertEqual(category_results[0].id, first.id)

            brand_results = repo.list_products(brand="Apple")
            self.assertEqual(len(brand_results), 2)

            exact_model_results = repo.list_products(query="A3104")
            self.assertEqual(exact_model_results[0].id, first.id)

            exact_sku_results = repo.list_products(query="MBA13-M3-512")
            self.assertEqual(exact_sku_results[0].id, second.id)

            attribute_results = repo.list_products(query="512GB")
            self.assertEqual(len(attribute_results), 1)
            self.assertEqual(attribute_results[0].id, second.id)

            updated = repo.update_product(
                first.id,
                name="iPhone 15 Pro Max",
                category="手机",
                brand="Apple",
                model="A3104",
                sku="IP15PROMAX-256-BLK",
                aliases="iPhone 15 Pro Max 国行",
                price="8999 元",
                currency="CNY",
                status="active",
                summary="更新后的说明。",
                tags="手机,Apple,iOS",
                attributes="color: black\nstorage: 256GB\nnetwork: 5G",
            )
            assert updated is not None
            self.assertEqual(updated.name, "iPhone 15 Pro Max")
            self.assertEqual(updated.price, "8999 元")

            deleted = repo.delete_product(second.id)
            self.assertTrue(deleted)
            remaining = repo.list_products()
            self.assertEqual(len(remaining), 1)
            self.assertEqual(remaining[0].id, first.id)
            conn.close()

    def test_product_service_applies_defaults_and_duplicate_validation(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            db_path = root / "app.db"
            ensure_database(db_path)
            service = ProductService(db_path=db_path)

            created = service.create_product(
                name="  Pixel 9  ",
                category=" 手机 ",
                brand=" Google ",
                model=" PX9 ",
                sku="",
                aliases=" Pixel 旗舰 ",
                price=" 5999 元 ",
                currency="",
                status="",
                summary=" 旗舰机型 ",
                tags=" Android,Google ",
                attributes=" color: black ",
            )
            self.assertEqual(created.name, "Pixel 9")
            self.assertEqual(created.category, "手机")
            self.assertEqual(created.brand, "Google")
            self.assertEqual(created.model, "PX9")
            self.assertEqual(created.currency, "CNY")
            self.assertEqual(created.status, "active")

            with self.assertRaisesRegex(ValueError, "产品型号不能重复"):
                service.create_product(
                    name="Pixel 9 Pro",
                    category="手机",
                    brand="Google",
                    model="PX9",
                    sku="PX9-PRO",
                    aliases="",
                    price="6999 元",
                    currency="CNY",
                    status="active",
                    summary="",
                    tags="",
                    attributes="",
                )

            results = service.list_products(query="pixel")
            self.assertEqual(len(results), 1)
            self.assertEqual(results[0].id, created.id)


if __name__ == "__main__":
    unittest.main()
