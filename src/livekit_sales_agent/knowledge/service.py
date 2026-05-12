from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Optional

from .db import connect
from .jobs import JobRunner
from .retrieval import RetrievalService
from .chroma_store import ChromaStore
from .repositories import KnowledgeBaseRepository
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

    def list_chat_model_profiles(self):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.list_chat_model_profiles()

    def list_agent_profiles(self):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.list_agent_profiles()

    @staticmethod
    def _normalize_knowledge_base_ids(knowledge_base_ids: list[str]) -> list[str]:
        deduped: list[str] = []
        seen: set[str] = set()
        for kb_id in knowledge_base_ids:
            value = kb_id.strip()
            if not value or value in seen:
                continue
            deduped.append(value)
            seen.add(value)
        return deduped

    @staticmethod
    def _validate_agent_profile_dependencies(
        repo: KnowledgeBaseRepository,
        *,
        chat_model_profile_id: Optional[str],
        knowledge_base_ids: list[str],
        retrieval_top_k: int,
    ) -> None:
        if retrieval_top_k <= 0:
            raise ValueError("向量召回数量必须大于 0")
        if chat_model_profile_id and repo.get_chat_model_profile(chat_model_profile_id) is None:
            raise ValueError("智能体绑定的对话模型不存在")
        missing_kb_ids = [kb_id for kb_id in knowledge_base_ids if repo.get_knowledge_base(kb_id) is None]
        if missing_kb_ids:
            raise ValueError("智能体绑定的知识库不存在")

    def create_agent_profile(
        self,
        *,
        name: str,
        description: str,
        opening_message: str,
        system_prompt: str,
        fallback_prompt: str,
        chat_model_profile_id: Optional[str],
        retrieval_top_k: int,
        knowledge_base_ids: list[str],
        is_default: bool,
    ):
        normalized_kb_ids = self._normalize_knowledge_base_ids(knowledge_base_ids)
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            self._validate_agent_profile_dependencies(
                repo,
                chat_model_profile_id=chat_model_profile_id,
                knowledge_base_ids=normalized_kb_ids,
                retrieval_top_k=retrieval_top_k,
            )
            try:
                return repo.create_agent_profile(
                    name=name,
                    description=description,
                    opening_message=opening_message,
                    system_prompt=system_prompt,
                    fallback_prompt=fallback_prompt,
                    chat_model_profile_id=chat_model_profile_id,
                    retrieval_top_k=retrieval_top_k,
                    knowledge_base_ids=normalized_kb_ids,
                    is_default=is_default,
                )
            except sqlite3.IntegrityError as exc:
                raise ValueError("智能体名称不能重复") from exc

    def update_agent_profile(
        self,
        profile_id: str,
        *,
        name: str,
        description: str,
        opening_message: str,
        system_prompt: str,
        fallback_prompt: str,
        chat_model_profile_id: Optional[str],
        retrieval_top_k: int,
        knowledge_base_ids: list[str],
        is_default: bool,
    ):
        normalized_kb_ids = self._normalize_knowledge_base_ids(knowledge_base_ids)
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            self._validate_agent_profile_dependencies(
                repo,
                chat_model_profile_id=chat_model_profile_id,
                knowledge_base_ids=normalized_kb_ids,
                retrieval_top_k=retrieval_top_k,
            )
            try:
                return repo.update_agent_profile(
                    profile_id,
                    name=name,
                    description=description,
                    opening_message=opening_message,
                    system_prompt=system_prompt,
                    fallback_prompt=fallback_prompt,
                    chat_model_profile_id=chat_model_profile_id,
                    retrieval_top_k=retrieval_top_k,
                    knowledge_base_ids=normalized_kb_ids,
                    is_default=is_default,
                )
            except sqlite3.IntegrityError as exc:
                raise ValueError("智能体名称不能重复") from exc

    def delete_agent_profile(self, profile_id: str) -> bool:
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.delete_agent_profile(profile_id)

    def create_chat_model_profile(
        self,
        *,
        name: str,
        provider: str,
        model: str,
        base_url: str,
        api_key: str,
        is_default: bool,
    ):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.create_chat_model_profile(
                name=name,
                provider=provider,
                model=model,
                base_url=base_url,
                api_key=api_key,
                is_default=is_default,
            )

    def update_chat_model_profile(
        self,
        profile_id: str,
        *,
        name: str,
        provider: str,
        model: str,
        base_url: str,
        api_key: str,
        is_default: bool,
    ):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.update_chat_model_profile(
                profile_id,
                name=name,
                provider=provider,
                model=model,
                base_url=base_url,
                api_key=api_key,
                is_default=is_default,
            )

    def set_default_chat_model_profile(self, profile_id: str):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.set_default_chat_model_profile(profile_id)

    def delete_chat_model_profile(self, profile_id: str) -> bool:
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.delete_chat_model_profile(profile_id)

    def list_stt_model_profiles(self):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.list_stt_model_profiles()

    def create_stt_model_profile(
        self,
        *,
        name: str,
        provider: str,
        auth_mode: str,
        api_key: str,
        app_id: str,
        access_token: str,
        uid: str,
        resource_id: str,
        cluster: str,
        ws_url: str,
        language: str,
        is_default: bool,
    ):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.create_stt_model_profile(
                name=name,
                provider=provider,
                auth_mode=auth_mode,
                api_key=api_key,
                app_id=app_id,
                access_token=access_token,
                uid=uid,
                resource_id=resource_id,
                cluster=cluster,
                ws_url=ws_url,
                language=language,
                is_default=is_default,
            )

    def update_stt_model_profile(
        self,
        profile_id: str,
        *,
        name: str,
        provider: str,
        auth_mode: str,
        api_key: str,
        app_id: str,
        access_token: str,
        uid: str,
        resource_id: str,
        cluster: str,
        ws_url: str,
        language: str,
        is_default: bool,
    ):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.update_stt_model_profile(
                profile_id,
                name=name,
                provider=provider,
                auth_mode=auth_mode,
                api_key=api_key,
                app_id=app_id,
                access_token=access_token,
                uid=uid,
                resource_id=resource_id,
                cluster=cluster,
                ws_url=ws_url,
                language=language,
                is_default=is_default,
            )

    def set_default_stt_model_profile(self, profile_id: str):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.set_default_stt_model_profile(profile_id)

    def delete_stt_model_profile(self, profile_id: str) -> bool:
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.delete_stt_model_profile(profile_id)

    def list_tts_model_profiles(self):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.list_tts_model_profiles()

    def create_tts_model_profile(
        self,
        *,
        name: str,
        provider: str,
        auth_mode: str,
        api_key: str,
        app_id: str,
        access_token: str,
        uid: str,
        resource_id: str,
        cluster: str,
        http_url: str,
        voice_type: str,
        encoding: str,
        sample_rate: int,
        speed_ratio: float,
        volume_ratio: float,
        pitch_ratio: float,
        is_default: bool,
    ):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.create_tts_model_profile(
                name=name,
                provider=provider,
                auth_mode=auth_mode,
                api_key=api_key,
                app_id=app_id,
                access_token=access_token,
                uid=uid,
                resource_id=resource_id,
                cluster=cluster,
                http_url=http_url,
                voice_type=voice_type,
                encoding=encoding,
                sample_rate=sample_rate,
                speed_ratio=speed_ratio,
                volume_ratio=volume_ratio,
                pitch_ratio=pitch_ratio,
                is_default=is_default,
            )

    def update_tts_model_profile(
        self,
        profile_id: str,
        *,
        name: str,
        provider: str,
        auth_mode: str,
        api_key: str,
        app_id: str,
        access_token: str,
        uid: str,
        resource_id: str,
        cluster: str,
        http_url: str,
        voice_type: str,
        encoding: str,
        sample_rate: int,
        speed_ratio: float,
        volume_ratio: float,
        pitch_ratio: float,
        is_default: bool,
    ):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.update_tts_model_profile(
                profile_id,
                name=name,
                provider=provider,
                auth_mode=auth_mode,
                api_key=api_key,
                app_id=app_id,
                access_token=access_token,
                uid=uid,
                resource_id=resource_id,
                cluster=cluster,
                http_url=http_url,
                voice_type=voice_type,
                encoding=encoding,
                sample_rate=sample_rate,
                speed_ratio=speed_ratio,
                volume_ratio=volume_ratio,
                pitch_ratio=pitch_ratio,
                is_default=is_default,
            )

    def set_default_tts_model_profile(self, profile_id: str):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.set_default_tts_model_profile(profile_id)

    def delete_tts_model_profile(self, profile_id: str) -> bool:
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.delete_tts_model_profile(profile_id)

    def list_embedding_profiles(self):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.list_embedding_profiles()

    def resume_pending_jobs(self) -> None:
        self._job_runner.resume_pending_jobs()

    def create_embedding_profile(
        self,
        *,
        name: str,
        provider: str,
        model: str,
        base_url: str,
        api_key_env: str,
    ):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.create_embedding_profile(
                name=name,
                provider=provider,
                model=model,
                base_url=base_url,
                api_key_env=api_key_env,
            )

    def update_embedding_profile(
        self,
        profile_id: str,
        *,
        name: str,
        provider: str,
        model: str,
        base_url: str,
        api_key_env: str,
    ):
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            return repo.update_embedding_profile(
                profile_id,
                name=name,
                provider=provider,
                model=model,
                base_url=base_url,
                api_key_env=api_key_env,
            )

    def delete_embedding_profile(self, profile_id: str) -> tuple[bool, bool]:
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            if repo.count_knowledge_bases_using_embedding_profile(profile_id) > 0:
                return False, True
            return repo.delete_embedding_profile(profile_id), False

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

    def search(self, *, kb_id: str, query: str):
        return self._retrieval_service.search(kb_id=kb_id, query=query)
