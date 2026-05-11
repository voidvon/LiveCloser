from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from livekit_sales_agent.knowledge.db import ensure_database  # noqa: E402
from livekit_sales_agent.knowledge.service import KnowledgeService  # noqa: E402


class KnowledgeBaseCategoryTest(unittest.TestCase):
    def test_create_category_validates_parent_belongs_to_current_kb(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            db_path = root / "app.db"
            ensure_database(db_path)
            service = KnowledgeService(
                db_path=db_path,
                files_root=root / "files",
                chroma_root=root / "chroma",
            )

            embedding = service.create_embedding_profile(
                name="embedding",
                provider="openai_compatible",
                model="text-embedding-3-small",
                base_url="https://api.openai.com/v1",
                api_key_env="OPENAI_API_KEY",
            )
            kb_one = service.create_knowledge_base(
                name="产品资料",
                description="",
                embedding_profile_id=embedding.id,
                embedding_provider="openai_compatible",
                embedding_model="",
                embedding_base_url="",
                embedding_api_key_env="",
                chunk_size=800,
                chunk_overlap=120,
                retrieval_top_k=5,
            )
            kb_two = service.create_knowledge_base(
                name="售后 FAQ",
                description="",
                embedding_profile_id=embedding.id,
                embedding_provider="openai_compatible",
                embedding_model="",
                embedding_base_url="",
                embedding_api_key_env="",
                chunk_size=800,
                chunk_overlap=120,
                retrieval_top_k=5,
            )

            parent = service.create_category(
                kb_id=kb_one.id,
                name="方案资料",
                parent_id=None,
                sort_order=0,
            )

            child = service.create_category(
                kb_id=kb_one.id,
                name="产品手册",
                parent_id=parent.id,
                sort_order=0,
            )
            self.assertEqual(child.parent_id, parent.id)

            with self.assertRaisesRegex(ValueError, "父级分类不属于当前知识库"):
                service.create_category(
                    kb_id=kb_two.id,
                    name="错误子分类",
                    parent_id=parent.id,
                    sort_order=0,
                )

    def test_upload_file_validates_category_belongs_to_current_kb(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            db_path = root / "app.db"
            ensure_database(db_path)
            service = KnowledgeService(
                db_path=db_path,
                files_root=root / "files",
                chroma_root=root / "chroma",
            )
            service._job_runner.start_embed_job = lambda **_: None

            embedding = service.create_embedding_profile(
                name="embedding",
                provider="openai_compatible",
                model="text-embedding-3-small",
                base_url="https://api.openai.com/v1",
                api_key_env="OPENAI_API_KEY",
            )
            kb_one = service.create_knowledge_base(
                name="产品资料",
                description="",
                embedding_profile_id=embedding.id,
                embedding_provider="openai_compatible",
                embedding_model="",
                embedding_base_url="",
                embedding_api_key_env="",
                chunk_size=800,
                chunk_overlap=120,
                retrieval_top_k=5,
            )
            kb_two = service.create_knowledge_base(
                name="售后 FAQ",
                description="",
                embedding_profile_id=embedding.id,
                embedding_provider="openai_compatible",
                embedding_model="",
                embedding_base_url="",
                embedding_api_key_env="",
                chunk_size=800,
                chunk_overlap=120,
                retrieval_top_k=5,
            )
            category = service.create_category(
                kb_id=kb_one.id,
                name="话术",
                parent_id=None,
                sort_order=0,
            )

            with self.assertRaisesRegex(ValueError, "分类不属于当前知识库"):
                service.upload_file(
                    kb_id=kb_two.id,
                    original_name="faq.txt",
                    content=b"hello",
                    mime_type="text/plain",
                    category_id=category.id,
                )


if __name__ == "__main__":
    unittest.main()
