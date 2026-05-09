from __future__ import annotations

import threading
from pathlib import Path

from .chunker import chunk_sections
from .chroma_store import ChromaStore
from .db import connect
from .embeddings import EmbeddingClient
from .loaders import load_sections
from .models import ChunkDocument
from .repositories import KnowledgeBaseRepository, utc_now


class JobRunner:
    def __init__(self, *, db_path: Path, chroma_root: Path):
        self._db_path = db_path
        self._chroma_store = ChromaStore(root_dir=chroma_root)

    def resume_pending_jobs(self) -> None:
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            jobs = repo.list_pending_jobs()
        for job in jobs:
            if job.file_id is None:
                continue
            self.start_embed_job(job_id=job.id)

    def start_embed_job(self, *, job_id: str) -> None:
        thread = threading.Thread(target=self._run_embed_job, args=(job_id,), daemon=True)
        thread.start()

    def _run_embed_job(self, job_id: str) -> None:
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            job = repo.get_job(job_id)
            if job is None or job.file_id is None:
                return

            started_at = utc_now()
            repo.update_job_status(job_id, status="running", started_at=started_at)

            file_record = repo.get_file(job.file_id)
            kb_record = repo.get_knowledge_base(job.kb_id)
            if file_record is None or kb_record is None:
                repo.update_job_status(
                    job_id,
                    status="failed",
                    error_message="知识库或文件不存在",
                    finished_at=utc_now(),
                )
                return

            try:
                repo.update_file_status(file_record.id, status="embedding")

                sections = load_sections(Path(file_record.stored_path))
                chunk_candidates = chunk_sections(
                    sections,
                    chunk_size=kb_record.chunk_size,
                    chunk_overlap=kb_record.chunk_overlap,
                )
                chunk_docs = [
                    ChunkDocument(
                        chunk_id=f"{file_record.id}:{candidate.chunk_index}",
                        kb_id=kb_record.id,
                        file_id=file_record.id,
                        category_id=file_record.category_id,
                        source_path=file_record.stored_path,
                        title=candidate.section_title,
                        content=candidate.content,
                        chunk_index=candidate.chunk_index,
                    )
                    for candidate in chunk_candidates
                ]

                embedding_client = EmbeddingClient(
                    provider=kb_record.embedding_provider,
                    model=kb_record.embedding_model,
                    base_url=kb_record.embedding_base_url,
                    api_key_env=kb_record.embedding_api_key_env,
                )
                vectors = embedding_client.embed_texts([item.content for item in chunk_docs])

                repo.delete_chunks_for_file(file_record.id)
                self._chroma_store.replace_file_chunks(
                    kb_id=kb_record.id,
                    file_id=file_record.id,
                    chunks=chunk_docs,
                    embeddings=vectors,
                )

                for chunk in chunk_docs:
                    repo.create_chunk(
                        kb_id=chunk.kb_id,
                        file_id=chunk.file_id,
                        chunk_index=chunk.chunk_index,
                        section_title=chunk.title,
                        content_preview=chunk.content[:240],
                        chroma_doc_id=chunk.chunk_id,
                        category_id=chunk.category_id,
                    )

                finished_at = utc_now()
                repo.update_file_status(file_record.id, status="ready", last_embedded_at=finished_at)
                repo.update_job_status(job_id, status="completed", finished_at=finished_at)
            except Exception as exc:
                finished_at = utc_now()
                repo.update_file_status(file_record.id, status="failed")
                repo.update_job_status(
                    job_id,
                    status="failed",
                    error_message=str(exc),
                    finished_at=finished_at,
                )
