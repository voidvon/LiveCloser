from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from .models import (
    AgentProfileRecord,
    CategoryRecord,
    ChatModelProfileRecord,
    ChunkRecord,
    EmbeddingProfileRecord,
    FileRecord,
    JobRecord,
    KnowledgeBaseRecord,
    SttModelProfileRecord,
    TtsModelProfileRecord,
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_kb(row: sqlite3.Row) -> KnowledgeBaseRecord:
    return KnowledgeBaseRecord(**dict(row))


def _row_to_embedding_profile(row: sqlite3.Row) -> EmbeddingProfileRecord:
    return EmbeddingProfileRecord(**dict(row))


def _row_to_chat_model_profile(row: sqlite3.Row) -> ChatModelProfileRecord:
    return ChatModelProfileRecord(**dict(row))


def _row_to_agent_profile(row: sqlite3.Row) -> AgentProfileRecord:
    return AgentProfileRecord(**dict(row))


def _row_to_category(row: sqlite3.Row) -> CategoryRecord:
    return CategoryRecord(**dict(row))


def _row_to_file(row: sqlite3.Row) -> FileRecord:
    return FileRecord(**dict(row))


def _row_to_job(row: sqlite3.Row) -> JobRecord:
    return JobRecord(**dict(row))


def _row_to_chunk(row: sqlite3.Row) -> ChunkRecord:
    return ChunkRecord(**dict(row))


def _row_to_stt_model_profile(row: sqlite3.Row) -> SttModelProfileRecord:
    return SttModelProfileRecord(**dict(row))


def _row_to_tts_model_profile(row: sqlite3.Row) -> TtsModelProfileRecord:
    return TtsModelProfileRecord(**dict(row))


class KnowledgeBaseRepository:
    def __init__(self, conn: sqlite3.Connection):
        self._conn = conn

    def list_chat_model_profiles(self) -> list[ChatModelProfileRecord]:
        rows = self._conn.execute(
            """
            SELECT *
            FROM chat_model_profiles
            ORDER BY is_default DESC, updated_at DESC, created_at DESC
            """
        ).fetchall()
        return [_row_to_chat_model_profile(row) for row in rows]

    def get_chat_model_profile(self, profile_id: str) -> Optional[ChatModelProfileRecord]:
        row = self._conn.execute(
            "SELECT * FROM chat_model_profiles WHERE id = ?", (profile_id,)
        ).fetchone()
        return _row_to_chat_model_profile(row) if row else None

    def get_default_chat_model_profile(self) -> Optional[ChatModelProfileRecord]:
        row = self._conn.execute(
            "SELECT * FROM chat_model_profiles WHERE is_default = 1 LIMIT 1"
        ).fetchone()
        return _row_to_chat_model_profile(row) if row else None

    def create_chat_model_profile(
        self,
        *,
        name: str,
        provider: str,
        model: str,
        base_url: str,
        api_key: str,
        is_default: bool,
    ) -> ChatModelProfileRecord:
        record_id = str(uuid4())
        now = utc_now()
        should_default = is_default or self.get_default_chat_model_profile() is None
        if should_default:
            self._conn.execute("UPDATE chat_model_profiles SET is_default = 0 WHERE is_default = 1")
        self._conn.execute(
            """
            INSERT INTO chat_model_profiles (
                id, name, provider, model, base_url, api_key, is_default, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record_id,
                name,
                provider,
                model,
                base_url,
                api_key,
                1 if should_default else 0,
                now,
                now,
            ),
        )
        self._conn.commit()
        record = self.get_chat_model_profile(record_id)
        assert record is not None
        return record

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
    ) -> Optional[ChatModelProfileRecord]:
        existing = self.get_chat_model_profile(profile_id)
        if existing is None:
            return None

        now = utc_now()
        should_default = (
            bool(existing.is_default)
            or is_default
            or self.get_default_chat_model_profile() is None
        )
        if is_default:
            self._conn.execute("UPDATE chat_model_profiles SET is_default = 0 WHERE is_default = 1")
        self._conn.execute(
            """
            UPDATE chat_model_profiles
            SET name = ?, provider = ?, model = ?, base_url = ?, api_key = ?, is_default = ?, updated_at = ?
            WHERE id = ?
            """,
            (name, provider, model, base_url, api_key, 1 if should_default else 0, now, profile_id),
        )
        self._conn.commit()
        return self.get_chat_model_profile(profile_id)

    def set_default_chat_model_profile(self, profile_id: str) -> Optional[ChatModelProfileRecord]:
        existing = self.get_chat_model_profile(profile_id)
        if existing is None:
            return None

        now = utc_now()
        self._conn.execute("UPDATE chat_model_profiles SET is_default = 0 WHERE is_default = 1")
        self._conn.execute(
            "UPDATE chat_model_profiles SET is_default = 1, updated_at = ? WHERE id = ?",
            (now, profile_id),
        )
        self._conn.commit()
        return self.get_chat_model_profile(profile_id)

    def delete_chat_model_profile(self, profile_id: str) -> bool:
        existing = self.get_chat_model_profile(profile_id)
        if existing is None:
            return False

        cursor = self._conn.execute("DELETE FROM chat_model_profiles WHERE id = ?", (profile_id,))
        if cursor.rowcount <= 0:
            self._conn.commit()
            return False

        if existing.is_default:
            replacement = self._conn.execute(
                """
                SELECT id
                FROM chat_model_profiles
                ORDER BY updated_at DESC, created_at DESC
                LIMIT 1
                """
            ).fetchone()
            if replacement is not None:
                self._conn.execute(
                    "UPDATE chat_model_profiles SET is_default = 1 WHERE id = ?",
                    (replacement["id"],),
                )

        self._conn.commit()
        return True

    def _hydrate_agent_profile_knowledge_bases(
        self, records: list[AgentProfileRecord]
    ) -> list[AgentProfileRecord]:
        if not records:
            return records

        profile_ids = [record.id for record in records]
        placeholders = ",".join("?" for _ in profile_ids)
        rows = self._conn.execute(
            f"""
            SELECT agent_profile_id, kb_id
            FROM agent_profile_kb_bindings
            WHERE agent_profile_id IN ({placeholders})
            ORDER BY rowid ASC
            """,
            profile_ids,
        ).fetchall()
        kb_ids_by_profile = {profile_id: [] for profile_id in profile_ids}
        for row in rows:
            kb_ids_by_profile[row["agent_profile_id"]].append(row["kb_id"])
        for record in records:
            record.knowledge_base_ids = kb_ids_by_profile.get(record.id, [])
        return records

    def list_agent_profiles(self) -> list[AgentProfileRecord]:
        rows = self._conn.execute(
            """
            SELECT *
            FROM agent_profiles
            ORDER BY is_default DESC, updated_at DESC, created_at DESC
            """
        ).fetchall()
        records = [_row_to_agent_profile(row) for row in rows]
        return self._hydrate_agent_profile_knowledge_bases(records)

    def get_agent_profile(self, profile_id: str) -> Optional[AgentProfileRecord]:
        rows = self._conn.execute(
            "SELECT * FROM agent_profiles WHERE id = ?",
            (profile_id,),
        ).fetchall()
        records = [_row_to_agent_profile(row) for row in rows]
        hydrated = self._hydrate_agent_profile_knowledge_bases(records)
        return hydrated[0] if hydrated else None

    def get_default_agent_profile(self) -> Optional[AgentProfileRecord]:
        rows = self._conn.execute(
            "SELECT * FROM agent_profiles WHERE is_default = 1 LIMIT 1"
        ).fetchall()
        records = [_row_to_agent_profile(row) for row in rows]
        hydrated = self._hydrate_agent_profile_knowledge_bases(records)
        return hydrated[0] if hydrated else None

    def _replace_agent_profile_knowledge_bases(
        self,
        profile_id: str,
        knowledge_base_ids: list[str],
    ) -> None:
        now = utc_now()
        self._conn.execute(
            "DELETE FROM agent_profile_kb_bindings WHERE agent_profile_id = ?",
            (profile_id,),
        )
        for kb_id in knowledge_base_ids:
            self._conn.execute(
                """
                INSERT INTO agent_profile_kb_bindings (
                    id, agent_profile_id, kb_id, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                (str(uuid4()), profile_id, kb_id, now, now),
            )

    def create_agent_profile(
        self,
        *,
        name: str,
        description: str,
        system_prompt: str,
        fallback_prompt: str,
        chat_model_profile_id: Optional[str],
        retrieval_top_k: int,
        knowledge_base_ids: list[str],
        is_default: bool,
    ) -> AgentProfileRecord:
        record_id = str(uuid4())
        now = utc_now()
        should_default = is_default or self.get_default_agent_profile() is None
        if should_default:
            self._conn.execute("UPDATE agent_profiles SET is_default = 0 WHERE is_default = 1")
        self._conn.execute(
            """
            INSERT INTO agent_profiles (
                id, name, description, system_prompt, fallback_prompt,
                chat_model_profile_id, retrieval_top_k, is_default, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record_id,
                name,
                description,
                system_prompt,
                fallback_prompt,
                chat_model_profile_id,
                retrieval_top_k,
                1 if should_default else 0,
                now,
                now,
            ),
        )
        self._replace_agent_profile_knowledge_bases(record_id, knowledge_base_ids)
        self._conn.commit()
        record = self.get_agent_profile(record_id)
        assert record is not None
        return record

    def update_agent_profile(
        self,
        profile_id: str,
        *,
        name: str,
        description: str,
        system_prompt: str,
        fallback_prompt: str,
        chat_model_profile_id: Optional[str],
        retrieval_top_k: int,
        knowledge_base_ids: list[str],
        is_default: bool,
    ) -> Optional[AgentProfileRecord]:
        existing = self.get_agent_profile(profile_id)
        if existing is None:
            return None

        now = utc_now()
        should_default = (
            bool(existing.is_default)
            or is_default
            or self.get_default_agent_profile() is None
        )
        if is_default:
            self._conn.execute("UPDATE agent_profiles SET is_default = 0 WHERE is_default = 1")
        self._conn.execute(
            """
            UPDATE agent_profiles
            SET name = ?, description = ?, system_prompt = ?, fallback_prompt = ?,
                chat_model_profile_id = ?, retrieval_top_k = ?, is_default = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                name,
                description,
                system_prompt,
                fallback_prompt,
                chat_model_profile_id,
                retrieval_top_k,
                1 if should_default else 0,
                now,
                profile_id,
            ),
        )
        self._replace_agent_profile_knowledge_bases(profile_id, knowledge_base_ids)
        self._conn.commit()
        return self.get_agent_profile(profile_id)

    def delete_agent_profile(self, profile_id: str) -> bool:
        existing = self.get_agent_profile(profile_id)
        if existing is None:
            return False

        cursor = self._conn.execute("DELETE FROM agent_profiles WHERE id = ?", (profile_id,))
        if cursor.rowcount <= 0:
            self._conn.commit()
            return False

        if existing.is_default:
            replacement = self._conn.execute(
                """
                SELECT id
                FROM agent_profiles
                ORDER BY updated_at DESC, created_at DESC
                LIMIT 1
                """
            ).fetchone()
            if replacement is not None:
                self._conn.execute(
                    "UPDATE agent_profiles SET is_default = 1 WHERE id = ?",
                    (replacement["id"],),
                )

        self._conn.commit()
        return True

    def list_stt_model_profiles(self) -> list[SttModelProfileRecord]:
        rows = self._conn.execute(
            """
            SELECT *
            FROM stt_model_profiles
            ORDER BY is_default DESC, updated_at DESC, created_at DESC
            """
        ).fetchall()
        return [_row_to_stt_model_profile(row) for row in rows]

    def get_stt_model_profile(self, profile_id: str) -> Optional[SttModelProfileRecord]:
        row = self._conn.execute(
            "SELECT * FROM stt_model_profiles WHERE id = ?", (profile_id,)
        ).fetchone()
        return _row_to_stt_model_profile(row) if row else None

    def get_default_stt_model_profile(self) -> Optional[SttModelProfileRecord]:
        row = self._conn.execute(
            "SELECT * FROM stt_model_profiles WHERE is_default = 1 LIMIT 1"
        ).fetchone()
        return _row_to_stt_model_profile(row) if row else None

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
    ) -> SttModelProfileRecord:
        record_id = str(uuid4())
        now = utc_now()
        should_default = is_default or self.get_default_stt_model_profile() is None
        if should_default:
            self._conn.execute("UPDATE stt_model_profiles SET is_default = 0 WHERE is_default = 1")
        self._conn.execute(
            """
            INSERT INTO stt_model_profiles (
                id, name, provider, auth_mode, api_key, app_id, access_token, uid,
                resource_id, cluster, ws_url, language, is_default, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record_id,
                name,
                provider,
                auth_mode,
                api_key,
                app_id,
                access_token,
                uid,
                resource_id,
                cluster,
                ws_url,
                language,
                1 if should_default else 0,
                now,
                now,
            ),
        )
        self._conn.commit()
        record = self.get_stt_model_profile(record_id)
        assert record is not None
        return record

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
    ) -> Optional[SttModelProfileRecord]:
        existing = self.get_stt_model_profile(profile_id)
        if existing is None:
            return None

        now = utc_now()
        should_default = (
            bool(existing.is_default)
            or is_default
            or self.get_default_stt_model_profile() is None
        )
        if is_default:
            self._conn.execute("UPDATE stt_model_profiles SET is_default = 0 WHERE is_default = 1")
        self._conn.execute(
            """
            UPDATE stt_model_profiles
            SET name = ?, provider = ?, auth_mode = ?, api_key = ?, app_id = ?,
                access_token = ?, uid = ?, resource_id = ?, cluster = ?, ws_url = ?,
                language = ?, is_default = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                name,
                provider,
                auth_mode,
                api_key,
                app_id,
                access_token,
                uid,
                resource_id,
                cluster,
                ws_url,
                language,
                1 if should_default else 0,
                now,
                profile_id,
            ),
        )
        self._conn.commit()
        return self.get_stt_model_profile(profile_id)

    def set_default_stt_model_profile(self, profile_id: str) -> Optional[SttModelProfileRecord]:
        existing = self.get_stt_model_profile(profile_id)
        if existing is None:
            return None

        now = utc_now()
        self._conn.execute("UPDATE stt_model_profiles SET is_default = 0 WHERE is_default = 1")
        self._conn.execute(
            "UPDATE stt_model_profiles SET is_default = 1, updated_at = ? WHERE id = ?",
            (now, profile_id),
        )
        self._conn.commit()
        return self.get_stt_model_profile(profile_id)

    def delete_stt_model_profile(self, profile_id: str) -> bool:
        existing = self.get_stt_model_profile(profile_id)
        if existing is None:
            return False

        cursor = self._conn.execute("DELETE FROM stt_model_profiles WHERE id = ?", (profile_id,))
        if cursor.rowcount <= 0:
            self._conn.commit()
            return False

        if existing.is_default:
            replacement = self._conn.execute(
                """
                SELECT id
                FROM stt_model_profiles
                ORDER BY updated_at DESC, created_at DESC
                LIMIT 1
                """
            ).fetchone()
            if replacement is not None:
                self._conn.execute(
                    "UPDATE stt_model_profiles SET is_default = 1 WHERE id = ?",
                    (replacement["id"],),
                )

        self._conn.commit()
        return True

    def list_tts_model_profiles(self) -> list[TtsModelProfileRecord]:
        rows = self._conn.execute(
            """
            SELECT *
            FROM tts_model_profiles
            ORDER BY is_default DESC, updated_at DESC, created_at DESC
            """
        ).fetchall()
        return [_row_to_tts_model_profile(row) for row in rows]

    def get_tts_model_profile(self, profile_id: str) -> Optional[TtsModelProfileRecord]:
        row = self._conn.execute(
            "SELECT * FROM tts_model_profiles WHERE id = ?", (profile_id,)
        ).fetchone()
        return _row_to_tts_model_profile(row) if row else None

    def get_default_tts_model_profile(self) -> Optional[TtsModelProfileRecord]:
        row = self._conn.execute(
            "SELECT * FROM tts_model_profiles WHERE is_default = 1 LIMIT 1"
        ).fetchone()
        return _row_to_tts_model_profile(row) if row else None

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
    ) -> TtsModelProfileRecord:
        record_id = str(uuid4())
        now = utc_now()
        should_default = is_default or self.get_default_tts_model_profile() is None
        if should_default:
            self._conn.execute("UPDATE tts_model_profiles SET is_default = 0 WHERE is_default = 1")
        self._conn.execute(
            """
            INSERT INTO tts_model_profiles (
                id, name, provider, auth_mode, api_key, app_id, access_token, uid,
                resource_id, cluster, http_url, voice_type, encoding, sample_rate,
                speed_ratio, volume_ratio, pitch_ratio, is_default, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record_id,
                name,
                provider,
                auth_mode,
                api_key,
                app_id,
                access_token,
                uid,
                resource_id,
                cluster,
                http_url,
                voice_type,
                encoding,
                sample_rate,
                speed_ratio,
                volume_ratio,
                pitch_ratio,
                1 if should_default else 0,
                now,
                now,
            ),
        )
        self._conn.commit()
        record = self.get_tts_model_profile(record_id)
        assert record is not None
        return record

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
    ) -> Optional[TtsModelProfileRecord]:
        existing = self.get_tts_model_profile(profile_id)
        if existing is None:
            return None

        now = utc_now()
        should_default = (
            bool(existing.is_default)
            or is_default
            or self.get_default_tts_model_profile() is None
        )
        if is_default:
            self._conn.execute("UPDATE tts_model_profiles SET is_default = 0 WHERE is_default = 1")
        self._conn.execute(
            """
            UPDATE tts_model_profiles
            SET name = ?, provider = ?, auth_mode = ?, api_key = ?, app_id = ?,
                access_token = ?, uid = ?, resource_id = ?, cluster = ?, http_url = ?,
                voice_type = ?, encoding = ?, sample_rate = ?, speed_ratio = ?,
                volume_ratio = ?, pitch_ratio = ?, is_default = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                name,
                provider,
                auth_mode,
                api_key,
                app_id,
                access_token,
                uid,
                resource_id,
                cluster,
                http_url,
                voice_type,
                encoding,
                sample_rate,
                speed_ratio,
                volume_ratio,
                pitch_ratio,
                1 if should_default else 0,
                now,
                profile_id,
            ),
        )
        self._conn.commit()
        return self.get_tts_model_profile(profile_id)

    def set_default_tts_model_profile(self, profile_id: str) -> Optional[TtsModelProfileRecord]:
        existing = self.get_tts_model_profile(profile_id)
        if existing is None:
            return None

        now = utc_now()
        self._conn.execute("UPDATE tts_model_profiles SET is_default = 0 WHERE is_default = 1")
        self._conn.execute(
            "UPDATE tts_model_profiles SET is_default = 1, updated_at = ? WHERE id = ?",
            (now, profile_id),
        )
        self._conn.commit()
        return self.get_tts_model_profile(profile_id)

    def delete_tts_model_profile(self, profile_id: str) -> bool:
        existing = self.get_tts_model_profile(profile_id)
        if existing is None:
            return False

        cursor = self._conn.execute("DELETE FROM tts_model_profiles WHERE id = ?", (profile_id,))
        if cursor.rowcount <= 0:
            self._conn.commit()
            return False

        if existing.is_default:
            replacement = self._conn.execute(
                """
                SELECT id
                FROM tts_model_profiles
                ORDER BY updated_at DESC, created_at DESC
                LIMIT 1
                """
            ).fetchone()
            if replacement is not None:
                self._conn.execute(
                    "UPDATE tts_model_profiles SET is_default = 1 WHERE id = ?",
                    (replacement["id"],),
                )

        self._conn.commit()
        return True

    def list_embedding_profiles(self) -> list[EmbeddingProfileRecord]:
        rows = self._conn.execute(
            "SELECT * FROM embedding_profiles ORDER BY updated_at DESC, created_at DESC"
        ).fetchall()
        return [_row_to_embedding_profile(row) for row in rows]

    def get_embedding_profile(self, profile_id: str) -> Optional[EmbeddingProfileRecord]:
        row = self._conn.execute(
            "SELECT * FROM embedding_profiles WHERE id = ?", (profile_id,)
        ).fetchone()
        return _row_to_embedding_profile(row) if row else None

    def create_embedding_profile(
        self,
        *,
        name: str,
        provider: str,
        model: str,
        base_url: str,
        api_key_env: str,
    ) -> EmbeddingProfileRecord:
        record_id = str(uuid4())
        now = utc_now()
        self._conn.execute(
            """
            INSERT INTO embedding_profiles (
                id, name, provider, model, base_url, api_key_env, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (record_id, name, provider, model, base_url, api_key_env, now, now),
        )
        self._conn.commit()
        record = self.get_embedding_profile(record_id)
        assert record is not None
        return record

    def update_embedding_profile(
        self,
        profile_id: str,
        *,
        name: str,
        provider: str,
        model: str,
        base_url: str,
        api_key_env: str,
    ) -> Optional[EmbeddingProfileRecord]:
        now = utc_now()
        self._conn.execute(
            """
            UPDATE embedding_profiles
            SET name = ?, provider = ?, model = ?, base_url = ?, api_key_env = ?, updated_at = ?
            WHERE id = ?
            """,
            (name, provider, model, base_url, api_key_env, now, profile_id),
        )
        self._conn.commit()
        return self.get_embedding_profile(profile_id)

    def delete_embedding_profile(self, profile_id: str) -> bool:
        cursor = self._conn.execute("DELETE FROM embedding_profiles WHERE id = ?", (profile_id,))
        self._conn.commit()
        return cursor.rowcount > 0

    def count_knowledge_bases_using_embedding_profile(self, profile_id: str) -> int:
        row = self._conn.execute(
            "SELECT COUNT(*) AS count FROM knowledge_bases WHERE embedding_profile_id = ?",
            (profile_id,),
        ).fetchone()
        return int(row["count"]) if row else 0

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
        embedding_profile_id: Optional[str],
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
                id, name, description, embedding_profile_id, embedding_provider, embedding_model,
                embedding_base_url, embedding_api_key_env, chunk_size, chunk_overlap,
                retrieval_top_k, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record_id,
                name,
                description,
                embedding_profile_id,
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
        embedding_profile_id: Optional[str],
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
            SET name = ?, description = ?, embedding_profile_id = ?, embedding_provider = ?,
                embedding_model = ?, embedding_base_url = ?, embedding_api_key_env = ?,
                chunk_size = ?, chunk_overlap = ?, retrieval_top_k = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                name,
                description,
                embedding_profile_id,
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
