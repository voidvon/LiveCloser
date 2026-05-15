from __future__ import annotations

from pathlib import Path
from typing import Optional

from livekit_sales_agent.profiles import ProfileService

from .db import connect
from .jobs import JobRunner
from .retrieval import RetrievalService
from .chroma_store import ChromaStore
from .repositories import KnowledgeBaseRepository
from .rewrite import DocumentRewriteService, RewriteMessage
from .storage import (
    is_editable_text_file_name,
    normalize_file_name,
    read_text_file,
    save_uploaded_file,
    write_text_file,
)


class KnowledgeService:
    def __init__(self, *, db_path: Path, files_root: Path, chroma_root: Path):
        self._db_path = db_path
        self._files_root = files_root
        self._chroma_store = ChromaStore(root_dir=chroma_root)
        self._job_runner = JobRunner(db_path=db_path, chroma_root=chroma_root)
        self._profile_service = ProfileService(db_path=db_path)
        self._retrieval_service = RetrievalService(db_path=db_path, chroma_root=chroma_root)

    def list_knowledge_bases(self):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.list_knowledge_bases()

    @staticmethod
    def _ensure_knowledge_base_exists(repo: KnowledgeBaseRepository, kb_id: str) -> None:
        if repo.get_knowledge_base(kb_id) is None:
            raise ValueError("知识库不存在")

    @staticmethod
    def _validate_category_belongs_to_kb(
        repo: KnowledgeBaseRepository,
        *,
        kb_id: str,
        category_id: Optional[str],
        field_name: str = "分类",
    ) -> None:
        if not category_id:
            return
        category = repo.get_category(category_id)
        if category is None:
            raise ValueError(f"{field_name}不存在")
        if category.kb_id != kb_id:
            raise ValueError(f"{field_name}不属于当前知识库")

    @staticmethod
    def _get_file_for_kb(
        repo: KnowledgeBaseRepository, *, kb_id: str, file_id: str
    ):
        file_record = repo.get_file(file_id)
        if file_record is None or file_record.kb_id != kb_id:
            return None
        return file_record

    @staticmethod
    def _resolve_text_mime_type(file_name: str) -> str:
        suffix = Path(file_name).suffix.lower()
        if suffix in {".md", ".markdown"}:
            return "text/markdown"
        return "text/plain"

    def resume_pending_jobs(self) -> None:
        self._job_runner.resume_pending_jobs()

    def create_knowledge_base(
        self,
        *,
        name: str,
        description: str,
        embedding_profile_id: Optional[str],
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
            if embedding_profile_id and repo.get_embedding_profile(embedding_profile_id) is None:
                raise ValueError("Embedding profile not found")
            return repo.create_knowledge_base(
                name=name,
                description=description,
                embedding_profile_id=embedding_profile_id,
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
        embedding_profile_id: Optional[str],
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
            if embedding_profile_id and repo.get_embedding_profile(embedding_profile_id) is None:
                raise ValueError("Embedding profile not found")
            return repo.update_knowledge_base(
                kb_id,
                name=name,
                description=description,
                embedding_profile_id=embedding_profile_id,
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
            self._ensure_knowledge_base_exists(repo, kb_id)
            self._validate_category_belongs_to_kb(
                repo,
                kb_id=kb_id,
                category_id=parent_id,
                field_name="父级分类",
            )
            return repo.create_category(
                kb_id=kb_id, name=name, parent_id=parent_id, sort_order=sort_order
            )

    def list_files(self, kb_id: str):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.list_files(kb_id)

    def get_file_detail(self, *, kb_id: str, file_id: str):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            file_record = self._get_file_for_kb(repo, kb_id=kb_id, file_id=file_id)
            if file_record is None:
                return None
            if not is_editable_text_file_name(file_record.original_name):
                raise ValueError("仅支持编辑 txt 或 md 文档")
            content = read_text_file(Path(file_record.stored_path))
            return file_record, content

    def rewrite_file(
        self,
        *,
        kb_id: str,
        file_id: str,
        file_name: str,
        content: str,
        instruction: str,
        history: list[dict[str, str]],
        selected_text: Optional[str] = None,
    ):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            file_record = self._get_file_for_kb(repo, kb_id=kb_id, file_id=file_id)
            if file_record is None:
                return None
            if not is_editable_text_file_name(file_record.original_name):
                raise ValueError("仅支持编辑 txt 或 md 文档")

        model_settings = self._profile_service.load_chat_model_settings()
        rewrite_service = DocumentRewriteService(model=model_settings)
        parsed_history = [
            RewriteMessage(role=item.get("role", ""), content=item.get("content", ""))
            for item in history
            if isinstance(item, dict)
        ]
        return rewrite_service.rewrite(
            file_name=file_name,
            content=content,
            instruction=instruction,
            history=parsed_history,
            selected_text=selected_text,
        )

    def upload_file(
        self,
        *,
        kb_id: str,
        original_name: str,
        content: bytes,
        mime_type: str,
        category_id: Optional[str],
    ):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            self._ensure_knowledge_base_exists(repo, kb_id)
            self._validate_category_belongs_to_kb(
                repo,
                kb_id=kb_id,
                category_id=category_id,
            )

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

    def update_text_file(
        self,
        *,
        kb_id: str,
        file_id: str,
        original_name: str,
        content: str,
    ):
        return self.update_file(
            kb_id=kb_id,
            file_id=file_id,
            original_name=original_name,
            content=content,
        )

    def update_file(
        self,
        *,
        kb_id: str,
        file_id: str,
        original_name: Optional[str] = None,
        content: Optional[str] = None,
        category_id: Optional[str] = None,
        update_category: bool = False,
    ):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            file_record = self._get_file_for_kb(repo, kb_id=kb_id, file_id=file_id)
            if file_record is None:
                return None, None
            if update_category:
                self._validate_category_belongs_to_kb(
                    repo,
                    kb_id=kb_id,
                    category_id=category_id,
                )

        next_category_id = category_id if update_category else file_record.category_id
        wants_text_update = original_name is not None or content is not None
        next_original_name = file_record.original_name
        next_mime_type = file_record.mime_type
        next_size_bytes = file_record.size_bytes
        next_content_hash = file_record.content_hash

        if wants_text_update:
            if not is_editable_text_file_name(file_record.original_name):
                raise ValueError("仅支持编辑 txt 或 md 文档")

            if original_name is not None:
                normalized_name = normalize_file_name(original_name)
                current_suffix = Path(file_record.original_name).suffix.lower()
                next_suffix = Path(normalized_name).suffix.lower()
                if current_suffix != next_suffix:
                    raise ValueError("暂不支持修改文件扩展名")
                next_original_name = normalized_name

            if content is not None:
                next_size_bytes, next_content_hash = write_text_file(
                    Path(file_record.stored_path), content
                )

            next_mime_type = self._resolve_text_mime_type(next_original_name)

        content_changed = next_content_hash != file_record.content_hash
        category_changed = next_category_id != file_record.category_id
        metadata_changed = (
            next_original_name != file_record.original_name
            or next_mime_type != file_record.mime_type
            or next_size_bytes != file_record.size_bytes
            or next_content_hash != file_record.content_hash
            or category_changed
        )

        if not metadata_changed:
            return file_record, None

        job_record = None
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            updated_file = repo.update_file_metadata(
                file_id,
                category_id=next_category_id,
                original_name=next_original_name,
                mime_type=next_mime_type,
                size_bytes=next_size_bytes,
                content_hash=next_content_hash,
            )
            if updated_file is None:
                return None, None
            if content_changed or category_changed:
                updated_file = repo.update_file_status(
                    file_id, status="queued", last_embedded_at=None
                )
                job_record = repo.create_job(
                    kb_id=kb_id,
                    file_id=file_id,
                    job_type="reindex",
                    status="queued",
                )

        if job_record is not None:
            self._job_runner.start_embed_job(job_id=job_record.id)

        return updated_file, job_record

    def delete_file(self, *, kb_id: str, file_id: str) -> bool:
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            record = self._get_file_for_kb(repo, kb_id=kb_id, file_id=file_id)
            if record is None:
                return False

            self._chroma_store.delete_file_chunks(kb_id=record.kb_id, file_id=file_id)
            repo.delete_chunks_for_file(file_id)

            file_path = Path(record.stored_path)
            if file_path.exists():
                file_path.unlink()
            repo.delete_file(file_id)
            return True

    def list_jobs(self, kb_id: str):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.list_jobs(kb_id)

    def clear_finished_jobs(self, kb_id: str) -> int:
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            self._ensure_knowledge_base_exists(repo, kb_id)
            return repo.clear_finished_jobs(kb_id)

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

    def search(
        self,
        *,
        kb_id: str,
        query: str,
        top_k: int | None = None,
    ):
        return self._retrieval_service.search(
            kb_id=kb_id,
            query=query,
            top_k=top_k,
        )

    def search_many(
        self,
        *,
        knowledge_base_ids: list[str],
        query: str,
        top_k: int,
    ):
        return self._retrieval_service.search_many(
            kb_ids=knowledge_base_ids,
            query=query,
            top_k=top_k,
        )
