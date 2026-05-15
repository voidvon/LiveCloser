from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
import sqlite3
import os

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from livekit_sales_agent.defaults import (  # noqa: E402
    DEFAULT_IDLE_GOODBYE_MESSAGE,
    DEFAULT_IDLE_REMINDER_MESSAGE,
    DEFAULT_IDLE_TIMEOUT_SECONDS,
    DEFAULT_MAX_IDLE_REMINDERS,
    DEFAULT_OPENING_MESSAGE,
)
from livekit_sales_agent.config import Settings  # noqa: E402
from livekit_sales_agent.knowledge.db import LATEST_MIGRATION_VERSION, ensure_database  # noqa: E402
from livekit_sales_agent.knowledge.service import KnowledgeService  # noqa: E402
from livekit_sales_agent.profiles import ProfileService  # noqa: E402


class AgentProfileTest(unittest.TestCase):
    def test_settings_parse_fallback_profile_ids(self) -> None:
        previous_stt = os.environ.get("STT_FALLBACK_PROFILE_IDS")
        previous_tts = os.environ.get("TTS_FALLBACK_PROFILE_IDS")
        try:
            os.environ["STT_FALLBACK_PROFILE_IDS"] = " stt-a,stt-b,stt-a ,, "
            os.environ["TTS_FALLBACK_PROFILE_IDS"] = "tts-a, tts-b"
            settings = Settings.from_env()
            self.assertEqual(settings.stt_fallback_profile_ids, ["stt-a", "stt-b"])
            self.assertEqual(settings.tts_fallback_profile_ids, ["tts-a", "tts-b"])
        finally:
            if previous_stt is None:
                os.environ.pop("STT_FALLBACK_PROFILE_IDS", None)
            else:
                os.environ["STT_FALLBACK_PROFILE_IDS"] = previous_stt
            if previous_tts is None:
                os.environ.pop("TTS_FALLBACK_PROFILE_IDS", None)
            else:
                os.environ["TTS_FALLBACK_PROFILE_IDS"] = previous_tts

    def test_agent_profile_can_override_model_and_bind_multiple_kbs(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            db_path = root / "app.db"
            ensure_database(db_path)
            service = KnowledgeService(
                db_path=db_path,
                files_root=root / "files",
                chroma_root=root / "chroma",
            )
            profile_service = ProfileService(db_path=db_path)

            default_model = profile_service.create_chat_model_profile(
                name="default-model",
                provider="openai_compatible",
                model="gpt-4.1-mini",
                base_url="https://api.openai.com/v1",
                api_key="default-key",
                is_default=True,
            )
            custom_model = profile_service.create_chat_model_profile(
                name="agent-model",
                provider="openai_compatible",
                model="deepseek-v4-flash",
                base_url="https://api.deepseek.com/v1",
                api_key="agent-key",
                is_default=False,
            )
            embedding_profile = profile_service.create_embedding_profile(
                name="embedding",
                provider="openai_compatible",
                model="text-embedding-3-small",
                base_url="https://api.openai.com/v1",
                api_key_env="OPENAI_API_KEY",
            )
            kb_one = service.create_knowledge_base(
                name="产品资料",
                description="",
                embedding_profile_id=embedding_profile.id,
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
                embedding_profile_id=embedding_profile.id,
                embedding_provider="openai_compatible",
                embedding_model="",
                embedding_base_url="",
                embedding_api_key_env="",
                chunk_size=800,
                chunk_overlap=120,
                retrieval_top_k=5,
            )

            agent = profile_service.create_agent_profile(
                name="售前顾问",
                description="负责售前咨询",
                opening_message="你好，我是售前顾问，先和你确认下你的采购需求。",
                idle_timeout_seconds=12.0,
                max_idle_reminders=2,
                idle_reminder_message="喂，您还在吗？我想先确认一下您的需求。",
                idle_goodbye_message="我先不打扰您了，您方便的时候我们再继续聊。",
                system_prompt="你是售前顾问",
                fallback_prompt="当资料不足时，引导用户补充需求。",
                chat_model_profile_id=custom_model.id,
                retrieval_top_k=7,
                knowledge_base_ids=[kb_one.id, kb_two.id],
                is_default=True,
            )

            profiles = profile_service.list_agent_profiles()
            self.assertEqual(len(profiles), 1)
            self.assertEqual(profiles[0].knowledge_base_ids, [kb_one.id, kb_two.id])

            resolved = profile_service.load_agent_profile_settings(
                agent_profile_id=agent.id,
                default_retrieval_top_k=3,
            )
            self.assertEqual(resolved.profile_id, agent.id)
            self.assertEqual(resolved.retrieval_top_k, 7)
            self.assertEqual(resolved.knowledge_base_ids, [kb_one.id, kb_two.id])
            self.assertEqual(resolved.opening_message, "你好，我是售前顾问，先和你确认下你的采购需求。")
            self.assertEqual(resolved.idle_timeout_seconds, 12.0)
            self.assertEqual(resolved.max_idle_reminders, 2)
            self.assertEqual(resolved.idle_reminder_message, "喂，您还在吗？我想先确认一下您的需求。")
            self.assertEqual(resolved.idle_goodbye_message, "我先不打扰您了，您方便的时候我们再继续聊。")
            self.assertEqual(resolved.chat_model.model, custom_model.model)
            self.assertTrue(resolved.chat_model.is_deepseek_v4)

            fallback_resolved = profile_service.load_agent_profile_settings(
                agent_profile_id=None,
                default_retrieval_top_k=3,
            )
            self.assertEqual(fallback_resolved.profile_id, agent.id)
            self.assertEqual(fallback_resolved.chat_model.model, custom_model.model)
            self.assertNotEqual(default_model.id, custom_model.id)

    def test_agent_profile_migration_backfills_opening_message(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "app.db"
            conn = sqlite3.connect(db_path)
            try:
                conn.execute(
                    """
                    CREATE TABLE agent_profiles (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL UNIQUE,
                        description TEXT NOT NULL DEFAULT '',
                        system_prompt TEXT NOT NULL DEFAULT '',
                        fallback_prompt TEXT NOT NULL DEFAULT '',
                        chat_model_profile_id TEXT,
                        retrieval_top_k INTEGER NOT NULL DEFAULT 5,
                        is_default INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                    """
                )
                conn.execute(
                    """
                    INSERT INTO agent_profiles (
                        id, name, description, system_prompt, fallback_prompt,
                        chat_model_profile_id, retrieval_top_k, is_default, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        "agent-1",
                        "售前顾问",
                        "",
                        "",
                        "",
                        None,
                        5,
                        1,
                        "2025-01-01T00:00:00+00:00",
                        "2025-01-01T00:00:00+00:00",
                    ),
                )
                conn.commit()
            finally:
                conn.close()

            ensure_database(db_path)

            migrated = sqlite3.connect(db_path)
            migrated.row_factory = sqlite3.Row
            try:
                columns = {
                    row["name"] for row in migrated.execute("PRAGMA table_info(agent_profiles)").fetchall()
                }
                migration_versions = [
                    row["version"]
                    for row in migrated.execute(
                        "SELECT version FROM _migrations ORDER BY version ASC"
                    ).fetchall()
                ]
                self.assertIn("opening_message", columns)
                self.assertIn("idle_timeout_seconds", columns)
                self.assertIn("max_idle_reminders", columns)
                self.assertIn("idle_reminder_message", columns)
                self.assertIn("idle_goodbye_message", columns)
                self.assertEqual(migration_versions, list(range(1, LATEST_MIGRATION_VERSION + 1)))
                row = migrated.execute(
                    """
                    SELECT
                        opening_message,
                        idle_timeout_seconds,
                        max_idle_reminders,
                        idle_reminder_message,
                        idle_goodbye_message
                    FROM agent_profiles
                    WHERE id = ?
                    """,
                    ("agent-1",),
                ).fetchone()
                self.assertIsNotNone(row)
                self.assertEqual(row["opening_message"], DEFAULT_OPENING_MESSAGE)
                self.assertEqual(row["idle_timeout_seconds"], DEFAULT_IDLE_TIMEOUT_SECONDS)
                self.assertEqual(row["max_idle_reminders"], DEFAULT_MAX_IDLE_REMINDERS)
                self.assertEqual(row["idle_reminder_message"], DEFAULT_IDLE_REMINDER_MESSAGE)
                self.assertEqual(row["idle_goodbye_message"], DEFAULT_IDLE_GOODBYE_MESSAGE)
            finally:
                migrated.close()


if __name__ == "__main__":
    unittest.main()
