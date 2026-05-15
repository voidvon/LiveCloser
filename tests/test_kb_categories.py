from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from livekit_sales_agent.knowledge.db import ensure_database  # noqa: E402
from livekit_sales_agent.knowledge.db import connect  # noqa: E402
from livekit_sales_agent.knowledge.repositories import KnowledgeBaseRepository  # noqa: E402
from livekit_sales_agent.knowledge.service import KnowledgeService  # noqa: E402
from livekit_sales_agent.profiles import ProfileService  # noqa: E402


def _create_embedding_profile(db_path: Path):
    return ProfileService(db_path=db_path).create_embedding_profile(
        name="embedding",
        provider="openai_compatible",
        model="text-embedding-3-small",
        base_url="https://api.openai.com/v1",
        api_key_env="OPENAI_API_KEY",
    )


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

            embedding = _create_embedding_profile(db_path)
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

            embedding = _create_embedding_profile(db_path)
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

    def test_edit_text_file_updates_content_and_queues_reindex(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            db_path = root / "app.db"
            ensure_database(db_path)
            service = KnowledgeService(
                db_path=db_path,
                files_root=root / "files",
                chroma_root=root / "chroma",
            )
            queued_jobs: list[str] = []
            service._job_runner.start_embed_job = lambda **kwargs: queued_jobs.append(kwargs["job_id"])

            embedding = _create_embedding_profile(db_path)
            kb = service.create_knowledge_base(
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
            category = service.create_category(
                kb_id=kb.id,
                name="话术",
                parent_id=None,
                sort_order=0,
            )

            file_record, first_job = service.upload_file(
                kb_id=kb.id,
                original_name="faq.txt",
                content=b"old content",
                mime_type="text/plain",
                category_id=category.id,
            )
            self.assertEqual(len(queued_jobs), 1)
            self.assertEqual(queued_jobs[0], first_job.id)

            detail = service.get_file_detail(kb_id=kb.id, file_id=file_record.id)
            assert detail is not None
            loaded_file, loaded_content = detail
            self.assertEqual(loaded_file.original_name, "faq.txt")
            self.assertEqual(loaded_content, "old content")

            updated_file, reindex_job = service.update_text_file(
                kb_id=kb.id,
                file_id=file_record.id,
                original_name="faq-v2.txt",
                content="new content",
            )
            assert updated_file is not None
            assert reindex_job is not None
            self.assertEqual(updated_file.original_name, "faq-v2.txt")
            self.assertEqual(updated_file.status, "queued")
            self.assertEqual(len(queued_jobs), 2)
            self.assertEqual(queued_jobs[1], reindex_job.id)

            reloaded_detail = service.get_file_detail(kb_id=kb.id, file_id=file_record.id)
            assert reloaded_detail is not None
            _, reloaded_content = reloaded_detail
            self.assertEqual(reloaded_content, "new content")

    def test_update_file_category_queues_reindex_for_non_text_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            db_path = root / "app.db"
            ensure_database(db_path)
            service = KnowledgeService(
                db_path=db_path,
                files_root=root / "files",
                chroma_root=root / "chroma",
            )
            queued_jobs: list[str] = []
            service._job_runner.start_embed_job = lambda **kwargs: queued_jobs.append(kwargs["job_id"])

            embedding = _create_embedding_profile(db_path)
            kb = service.create_knowledge_base(
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
            first_category = service.create_category(
                kb_id=kb.id,
                name="产品手册",
                parent_id=None,
                sort_order=0,
            )
            second_category = service.create_category(
                kb_id=kb.id,
                name="销售资料",
                parent_id=None,
                sort_order=1,
            )

            file_record, first_job = service.upload_file(
                kb_id=kb.id,
                original_name="faq.json",
                content=b"[]",
                mime_type="application/json",
                category_id=first_category.id,
            )
            self.assertEqual(len(queued_jobs), 1)
            self.assertEqual(queued_jobs[0], first_job.id)

            updated_file, reindex_job = service.update_file(
                kb_id=kb.id,
                file_id=file_record.id,
                category_id=second_category.id,
                update_category=True,
            )
            assert updated_file is not None
            assert reindex_job is not None
            self.assertEqual(updated_file.category_id, second_category.id)
            self.assertEqual(updated_file.status, "queued")
            self.assertEqual(len(queued_jobs), 2)
            self.assertEqual(queued_jobs[1], reindex_job.id)

    def test_update_file_category_validates_target_category_belongs_to_current_kb(self) -> None:
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

            embedding = _create_embedding_profile(db_path)
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
                kb_id=kb_two.id,
                name="错误分类",
                parent_id=None,
                sort_order=0,
            )
            file_record, _ = service.upload_file(
                kb_id=kb_one.id,
                original_name="faq.json",
                content=b"[]",
                mime_type="application/json",
                category_id=None,
            )

            with self.assertRaisesRegex(ValueError, "分类不属于当前知识库"):
                service.update_file(
                    kb_id=kb_one.id,
                    file_id=file_record.id,
                    category_id=category.id,
                    update_category=True,
                )

    def test_delete_file_removes_disk_chunks_jobs_and_vector_records(self) -> None:
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
            deleted_vector_payloads: list[dict[str, str]] = []
            service._chroma_store.delete_file_chunks = lambda **kwargs: deleted_vector_payloads.append(kwargs)

            embedding = _create_embedding_profile(db_path)
            kb = service.create_knowledge_base(
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
            category = service.create_category(
                kb_id=kb.id,
                name="产品手册",
                parent_id=None,
                sort_order=0,
            )

            file_record, job_record = service.upload_file(
                kb_id=kb.id,
                original_name="faq.txt",
                content=b"to be deleted",
                mime_type="text/plain",
                category_id=category.id,
            )
            file_path = Path(file_record.stored_path)
            self.assertTrue(file_path.exists())

            with connect(db_path) as conn:
                repo = KnowledgeBaseRepository(conn)
                repo.create_chunk(
                    kb_id=kb.id,
                    file_id=file_record.id,
                    chunk_index=0,
                    section_title="FAQ",
                    content_preview="to be deleted",
                    chroma_doc_id=f"{file_record.id}:0",
                    category_id=category.id,
                )
                self.assertEqual(len(repo.list_chunks_for_file(file_record.id)), 1)
                self.assertIsNotNone(repo.get_job(job_record.id))

            deleted = service.delete_file(kb_id=kb.id, file_id=file_record.id)
            self.assertTrue(deleted)
            self.assertFalse(file_path.exists())
            self.assertEqual(
                deleted_vector_payloads,
                [{"kb_id": kb.id, "file_id": file_record.id}],
            )

            with connect(db_path) as conn:
                repo = KnowledgeBaseRepository(conn)
                self.assertIsNone(repo.get_file(file_record.id))
                self.assertEqual(repo.list_chunks_for_file(file_record.id), [])
                self.assertIsNone(repo.get_job(job_record.id))

    def test_edit_text_file_rejects_unsupported_file_type(self) -> None:
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

            embedding = _create_embedding_profile(db_path)
            kb = service.create_knowledge_base(
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

            file_record, _ = service.upload_file(
                kb_id=kb.id,
                original_name="faq.json",
                content=b"[]",
                mime_type="application/json",
                category_id=None,
            )

            with self.assertRaisesRegex(ValueError, "仅支持编辑 txt 或 md 文档"):
                service.get_file_detail(kb_id=kb.id, file_id=file_record.id)

    def test_clear_finished_jobs_keeps_active_jobs(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            db_path = root / "app.db"
            ensure_database(db_path)
            service = KnowledgeService(
                db_path=db_path,
                files_root=root / "files",
                chroma_root=root / "chroma",
            )

            embedding = _create_embedding_profile(db_path)
            kb = service.create_knowledge_base(
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

            with connect(db_path) as conn:
                repo = KnowledgeBaseRepository(conn)
                completed_job = repo.create_job(
                    kb_id=kb.id, file_id=None, job_type="reindex", status="completed"
                )
                failed_job = repo.create_job(
                    kb_id=kb.id, file_id=None, job_type="reindex", status="failed"
                )
                queued_job = repo.create_job(
                    kb_id=kb.id, file_id=None, job_type="reindex", status="queued"
                )
                running_job = repo.create_job(
                    kb_id=kb.id, file_id=None, job_type="reindex", status="running"
                )

            deleted_count = service.clear_finished_jobs(kb.id)
            self.assertEqual(deleted_count, 2)

            with connect(db_path) as conn:
                repo = KnowledgeBaseRepository(conn)
                remaining_ids = {job.id for job in repo.list_jobs(kb.id)}

            self.assertNotIn(completed_job.id, remaining_ids)
            self.assertNotIn(failed_job.id, remaining_ids)
            self.assertIn(queued_job.id, remaining_ids)
            self.assertIn(running_job.id, remaining_ids)


if __name__ == "__main__":
    unittest.main()
