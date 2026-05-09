from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from .models import CategoryRecord, ChunkRecord, FileRecord, JobRecord, KnowledgeBaseRecord


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_kb(row: sqlite3.Row) -> KnowledgeBaseRecord:
    return KnowledgeBaseRecord(**dict(row))


def _row_to_category(row: sqlite3.Row) -> CategoryRecord:
    return CategoryRecord(**dict(row))


def _row_to_file(row: sqlite3.Row) -> FileRecord:
    return FileRecord(**dict(row))


def _row_to_job(row: sqlite3.Row) -> JobRecord:
    return JobRecord(**dict(row))


def _row_to_chunk(row: sqlite3.Row) -> ChunkRecord:
    return ChunkRecord(**dict(row))


class KnowledgeBaseRepository:
    def __init__(self, conn: sqlite3.Connection):
        self._conn = conn

    def list_knowledge_bases(self) -> list[KnowledgeBaseRecord]:
        rows = self._conn.execute(
            "SELECT * FROM knowledge_bases ORDER BY updated_at DESC, created_at DESC"
        ).fetchall()
        return [_row_to_kb(row) for row in rows]

    def get_knowledge_base(self, kb_id: str) -> Optional[KnowledgeBaseRecord]:
        row = self._conn.execute(
            "SELECT * FROM knowledge_bases WHERE id = ?", (kb_id,)
        ).fetchone()
        return _row_to_kb(row) if row else None

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
    ) -> KnowledgeBaseRecord:
        record_id = str(uuid4())
        now = utc_now()
        self._conn.execute(
            """
            INSERT INTO knowledge_bases (
                id, name, description, embedding_provider, embedding_model, embedding_base_url,
                embedding_api_key_env, chunk_size, chunk_overlap, retrieval_top_k, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record_id,
                name,
                description,
                embedding_provider,
                embedding_model,
                embedding_base_url,
                embedding_api_key_env,
                chunk_size,
                chunk_overlap,
                retrieval_top_k,
                now,
                now,
            ),
        )
        self._conn.commit()
        record = self.get_knowledge_base(record_id)
        assert record is not None
        return record

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
    ) -> Optional[KnowledgeBaseRecord]:
        now = utc_now()
        self._conn.execute(
            """
            UPDATE knowledge_bases
            SET name = ?, description = ?, embedding_provider = ?, embedding_model = ?,
                embedding_base_url = ?, embedding_api_key_env = ?, chunk_size = ?,
                chunk_overlap = ?, retrieval_top_k = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                name,
                description,
                embedding_provider,
                embedding_model,
                embedding_base_url,
                embedding_api_key_env,
                chunk_size,
                chunk_overlap,
                retrieval_top_k,
                now,
                kb_id,
            ),
        )
        self._conn.commit()
        return self.get_knowledge_base(kb_id)

    def list_categories(self, kb_id: str) -> list[CategoryRecord]:
        rows = self._conn.execute(
            "SELECT * FROM kb_categories WHERE kb_id = ? ORDER BY sort_order ASC, name ASC",
            (kb_id,),
        ).fetchall()
        return [_row_to_category(row) for row in rows]

    def create_category(
        self, *, kb_id: str, name: str, parent_id: Optional[str], sort_order: int
    ) -> CategoryRecord:
        record_id = str(uuid4())
        now = utc_now()
        self._conn.execute(
            """
            INSERT INTO kb_categories (id, kb_id, name, parent_id, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (record_id, kb_id, name, parent_id, sort_order, now, now),
        )
        self._conn.commit()
        row = self._conn.execute(
            "SELECT * FROM kb_categories WHERE id = ?", (record_id,)
        ).fetchone()
        assert row is not None
        return _row_to_category(row)

    def get_category(self, category_id: str) -> Optional[CategoryRecord]:
        row = self._conn.execute(
            "SELECT * FROM kb_categories WHERE id = ?", (category_id,)
        ).fetchone()
        return _row_to_category(row) if row else None

    def list_files(self, kb_id: str) -> list[FileRecord]:
        rows = self._conn.execute(
            "SELECT * FROM kb_files WHERE kb_id = ? ORDER BY created_at DESC",
            (kb_id,),
        ).fetchall()
        return [_row_to_file(row) for row in rows]

    def get_file(self, file_id: str) -> Optional[FileRecord]:
        row = self._conn.execute("SELECT * FROM kb_files WHERE id = ?", (file_id,)).fetchone()
        return _row_to_file(row) if row else None

    def create_file(
        self,
        *,
        kb_id: str,
        category_id: Optional[str],
        original_name: str,
        stored_path: str,
        mime_type: str,
        size_bytes: int,
        content_hash: str,
    ) -> FileRecord:
        record_id = str(uuid4())
        now = utc_now()
        self._conn.execute(
            """
            INSERT INTO kb_files (
                id, kb_id, category_id, original_name, stored_path, mime_type, size_bytes,
                content_hash, status, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', ?, ?)
            """,
            (
                record_id,
                kb_id,
                category_id,
                original_name,
                stored_path,
                mime_type,
                size_bytes,
                content_hash,
                now,
                now,
            ),
        )
        self._conn.commit()
        record = self.get_file(record_id)
        assert record is not None
        return record

    def update_file_status(
        self, file_id: str, *, status: str, last_embedded_at: Optional[str] = None
    ) -> Optional[FileRecord]:
        now = utc_now()
        self._conn.execute(
            "UPDATE kb_files SET status = ?, updated_at = ?, last_embedded_at = ? WHERE id = ?",
            (status, now, last_embedded_at, file_id),
        )
        self._conn.commit()
        return self.get_file(file_id)

    def delete_file(self, file_id: str) -> None:
        self._conn.execute("DELETE FROM kb_files WHERE id = ?", (file_id,))
        self._conn.commit()

    def create_chunk(
        self,
        *,
        kb_id: str,
        file_id: str,
        chunk_index: int,
        section_title: str,
        content_preview: str,
        chroma_doc_id: str,
        category_id: Optional[str],
    ) -> ChunkRecord:
        record_id = str(uuid4())
        now = utc_now()
        self._conn.execute(
            """
            INSERT INTO kb_chunks (
                id, kb_id, file_id, chunk_index, section_title, content_preview,
                chroma_doc_id, category_id, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record_id,
                kb_id,
                file_id,
                chunk_index,
                section_title,
                content_preview,
                chroma_doc_id,
                category_id,
                now,
            ),
        )
        self._conn.commit()
        row = self._conn.execute("SELECT * FROM kb_chunks WHERE id = ?", (record_id,)).fetchone()
        assert row is not None
        return _row_to_chunk(row)

    def list_chunks_for_file(self, file_id: str) -> list[ChunkRecord]:
        rows = self._conn.execute(
            "SELECT * FROM kb_chunks WHERE file_id = ? ORDER BY chunk_index ASC",
            (file_id,),
        ).fetchall()
        return [_row_to_chunk(row) for row in rows]

    def delete_chunks_for_file(self, file_id: str) -> None:
        self._conn.execute("DELETE FROM kb_chunks WHERE file_id = ?", (file_id,))
        self._conn.commit()

    def create_job(self, *, kb_id: str, file_id: Optional[str], job_type: str, status: str) -> JobRecord:
        record_id = str(uuid4())
        now = utc_now()
        self._conn.execute(
            """
            INSERT INTO kb_jobs (id, kb_id, file_id, job_type, status, error_message, created_at)
            VALUES (?, ?, ?, ?, ?, '', ?)
            """,
            (record_id, kb_id, file_id, job_type, status, now),
        )
        self._conn.commit()
        row = self._conn.execute("SELECT * FROM kb_jobs WHERE id = ?", (record_id,)).fetchone()
        assert row is not None
        return _row_to_job(row)

    def get_job(self, job_id: str) -> Optional[JobRecord]:
        row = self._conn.execute("SELECT * FROM kb_jobs WHERE id = ?", (job_id,)).fetchone()
        return _row_to_job(row) if row else None

    def update_job_status(
        self,
        job_id: str,
        *,
        status: str,
        error_message: str = "",
        started_at: Optional[str] = None,
        finished_at: Optional[str] = None,
    ) -> Optional[JobRecord]:
        current = self.get_job(job_id)
        if current is None:
            return None
        self._conn.execute(
            """
            UPDATE kb_jobs
            SET status = ?, error_message = ?, started_at = ?, finished_at = ?
            WHERE id = ?
            """,
            (
                status,
                error_message,
                started_at if started_at is not None else current.started_at,
                finished_at if finished_at is not None else current.finished_at,
                job_id,
            ),
        )
        self._conn.commit()
        return self.get_job(job_id)

    def list_jobs(self, kb_id: str) -> list[JobRecord]:
        rows = self._conn.execute(
            "SELECT * FROM kb_jobs WHERE kb_id = ? ORDER BY created_at DESC LIMIT 50",
            (kb_id,),
        ).fetchall()
        return [_row_to_job(row) for row in rows]

    def list_pending_jobs(self) -> list[JobRecord]:
        rows = self._conn.execute(
            """
            SELECT * FROM kb_jobs
            WHERE status IN ('queued', 'running')
            ORDER BY created_at ASC
            """
        ).fetchall()
        return [_row_to_job(row) for row in rows]
