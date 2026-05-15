from __future__ import annotations

import sqlite3
from typing import Optional
from uuid import uuid4

from livekit_sales_agent.knowledge.models import (
    AgentProfileRecord,
    ChatModelProfileRecord,
    EmbeddingProfileRecord,
    SttModelProfileRecord,
    TtsModelProfileRecord,
)
from livekit_sales_agent.knowledge.repositories import (
    _row_to_agent_profile,
    _row_to_chat_model_profile,
    _row_to_embedding_profile,
    _row_to_stt_model_profile,
    _row_to_tts_model_profile,
    utc_now,
)


class ProfileRepository:
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
        return self.get_chat_model_profile(profile_id)

    def delete_chat_model_profile(self, profile_id: str) -> bool:
        existing = self.get_chat_model_profile(profile_id)
        if existing is None:
            return False

        cursor = self._conn.execute("DELETE FROM chat_model_profiles WHERE id = ?", (profile_id,))
        if cursor.rowcount <= 0:
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

        return True

    def _hydrate_agent_profile_knowledge_bases(
        self,
        records: list[AgentProfileRecord],
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
        opening_message: str,
        idle_timeout_seconds: float,
        max_idle_reminders: int,
        idle_reminder_message: str,
        idle_goodbye_message: str,
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
                id, name, description, opening_message, idle_timeout_seconds, max_idle_reminders,
                idle_reminder_message, idle_goodbye_message, system_prompt, fallback_prompt,
                chat_model_profile_id, retrieval_top_k, is_default, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record_id,
                name,
                description,
                opening_message,
                idle_timeout_seconds,
                max_idle_reminders,
                idle_reminder_message,
                idle_goodbye_message,
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
        record = self.get_agent_profile(record_id)
        assert record is not None
        return record

    def update_agent_profile(
        self,
        profile_id: str,
        *,
        name: str,
        description: str,
        opening_message: str,
        idle_timeout_seconds: float,
        max_idle_reminders: int,
        idle_reminder_message: str,
        idle_goodbye_message: str,
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
            SET name = ?, description = ?, opening_message = ?, idle_timeout_seconds = ?,
                max_idle_reminders = ?, idle_reminder_message = ?, idle_goodbye_message = ?,
                system_prompt = ?, fallback_prompt = ?, chat_model_profile_id = ?,
                retrieval_top_k = ?, is_default = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                name,
                description,
                opening_message,
                idle_timeout_seconds,
                max_idle_reminders,
                idle_reminder_message,
                idle_goodbye_message,
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
        return self.get_agent_profile(profile_id)

    def delete_agent_profile(self, profile_id: str) -> bool:
        existing = self.get_agent_profile(profile_id)
        if existing is None:
            return False

        cursor = self._conn.execute("DELETE FROM agent_profiles WHERE id = ?", (profile_id,))
        if cursor.rowcount <= 0:
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
        return self.get_stt_model_profile(profile_id)

    def delete_stt_model_profile(self, profile_id: str) -> bool:
        existing = self.get_stt_model_profile(profile_id)
        if existing is None:
            return False

        cursor = self._conn.execute("DELETE FROM stt_model_profiles WHERE id = ?", (profile_id,))
        if cursor.rowcount <= 0:
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
        return self.get_tts_model_profile(profile_id)

    def delete_tts_model_profile(self, profile_id: str) -> bool:
        existing = self.get_tts_model_profile(profile_id)
        if existing is None:
            return False

        cursor = self._conn.execute("DELETE FROM tts_model_profiles WHERE id = ?", (profile_id,))
        if cursor.rowcount <= 0:
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
        return self.get_embedding_profile(profile_id)

    def delete_embedding_profile(self, profile_id: str) -> bool:
        cursor = self._conn.execute("DELETE FROM embedding_profiles WHERE id = ?", (profile_id,))
        return cursor.rowcount > 0
