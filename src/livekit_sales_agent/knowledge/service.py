from __future__ import annotations

from pathlib import Path
from typing import Optional

from .db import connect
from .jobs import JobRunner
from .retrieval import RetrievalService
from .repositories import KnowledgeBaseRepository
from .storage import save_uploaded_file


class KnowledgeService:
    def __init__(self, *, db_path: Path, files_root: Path, chroma_root: Path):
        self._db_path = db_path
        self._files_root = files_root
        self._job_runner = JobRunner(db_path=db_path, chroma_root=chroma_root)
        self._retrieval_service = RetrievalService(db_path=db_path, chroma_root=chroma_root)

    def list_knowledge_bases(self):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.list_knowledge_bases()

    def resume_pending_jobs(self) -> None:
        self._job_runner.resume_pending_jobs()

    def create_knowledge_base(
        self,
        *,
        name: str,
        description: str,
        embedding_provider: str,
        embedding_model: str,
        embedding_base_url: str,
        embedding_api_key_env: str,
        chunk_size: int,
        chunk_overlap: int,
        retrieval_top_k: int,
    ):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.create_knowledge_base(
                name=name,
                description=description,
                embedding_provider=embedding_provider,
                embedding_model=embedding_model,
                embedding_base_url=embedding_base_url,
                embedding_api_key_env=embedding_api_key_env,
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
                retrieval_top_k=retrieval_top_k,
            )

    def update_knowledge_base(
        self,
        kb_id: str,
        *,
        name: str,
        description: str,
        embedding_provider: str,
        embedding_model: str,
        embedding_base_url: str,
        embedding_api_key_env: str,
        chunk_size: int,
        chunk_overlap: int,
        retrieval_top_k: int,
    ):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.update_knowledge_base(
                kb_id,
                name=name,
                description=description,
                embedding_provider=embedding_provider,
                embedding_model=embedding_model,
                embedding_base_url=embedding_base_url,
                embedding_api_key_env=embedding_api_key_env,
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
                retrieval_top_k=retrieval_top_k,
            )

    def list_categories(self, kb_id: str):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.list_categories(kb_id)

    def create_category(
        self, *, kb_id: str, name: str, parent_id: Optional[str], sort_order: int
    ):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.create_category(
                kb_id=kb_id, name=name, parent_id=parent_id, sort_order=sort_order
            )

    def list_files(self, kb_id: str):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.list_files(kb_id)

    def upload_file(
        self,
        *,
        kb_id: str,
        original_name: str,
        content: bytes,
        mime_type: str,
        category_id: Optional[str],
    ):
        saved_path, content_hash = save_uploaded_file(
            root_dir=self._files_root,
            kb_id=kb_id,
            original_name=original_name,
            content=content,
        )
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            file_record = repo.create_file(
                kb_id=kb_id,
                category_id=category_id,
                original_name=original_name,
                stored_path=str(saved_path),
                mime_type=mime_type,
                size_bytes=len(content),
                content_hash=content_hash,
            )
            file_record = repo.update_file_status(file_record.id, status="queued")
            assert file_record is not None
            job_record = repo.create_job(
                kb_id=kb_id, file_id=file_record.id, job_type="embed", status="queued"
            )
        self._job_runner.start_embed_job(job_id=job_record.id)
        return file_record, job_record

    def delete_file(self, file_id: str) -> bool:
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            record = repo.get_file(file_id)
            if record is None:
                return False
            file_path = Path(record.stored_path)
            if file_path.exists():
                file_path.unlink()
            repo.delete_file(file_id)
            return True

    def list_jobs(self, kb_id: str):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.list_jobs(kb_id)

    def reindex_file(self, *, kb_id: str, file_id: str):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            file_record = repo.get_file(file_id)
            if file_record is None or file_record.kb_id != kb_id:
                return None
            repo.update_file_status(file_id, status="queued")
            job_record = repo.create_job(
                kb_id=kb_id, file_id=file_id, job_type="reindex", status="queued"
            )
        self._job_runner.start_embed_job(job_id=job_record.id)
        return job_record

    def search(self, *, kb_id: str, query: str):
        return self._retrieval_service.search(kb_id=kb_id, query=query)
