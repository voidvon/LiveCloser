from __future__ import annotations

import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from livekit_sales_agent.conversation import ConversationService  # noqa: E402
from livekit_sales_agent.knowledge.db import ensure_database  # noqa: E402
from livekit_sales_agent.knowledge.service import KnowledgeService  # noqa: E402
from livekit_sales_agent.profiles import ProfileService  # noqa: E402


class ConversationContextTest(unittest.TestCase):
    def test_existing_database_is_migrated_before_new_indexes_are_created(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "app.db"
            conn = sqlite3.connect(db_path)
            try:
                conn.execute(
                    """
                    CREATE TABLE chat_conversations (
                        id TEXT PRIMARY KEY,
                        title TEXT NOT NULL DEFAULT '新会话',
                        knowledge_base_id TEXT,
                        last_mode TEXT NOT NULL DEFAULT 'text',
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        last_message_at TEXT,
                        last_message_preview TEXT NOT NULL DEFAULT ''
                    )
                    """
                )
                conn.commit()
            finally:
                conn.close()

            ensure_database(db_path)

            verify_conn = sqlite3.connect(db_path)
            try:
                columns = {
                    row[1]
                    for row in verify_conn.execute("PRAGMA table_info(chat_conversations)").fetchall()
                }
                indexes = {
                    row[1]
                    for row in verify_conn.execute("PRAGMA index_list(chat_conversations)").fetchall()
                }
            finally:
                verify_conn.close()

            self.assertIn("agent_profile_id", columns)
            self.assertIn("status", columns)
            self.assertIn("ended_at", columns)
            self.assertIn("end_reason", columns)
            self.assertIn("end_detail", columns)
            self.assertIn("idx_chat_conversations_agent_profile_id", indexes)

    def test_developer_messages_are_normalized_to_system(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "app.db"
            ensure_database(db_path)
            service = ConversationService(db_path=db_path)
            conversation = service.create_conversation(title="test")

            service.append_message(
                conversation_id=conversation.id,
                role="developer",
                content="仅供模型参考的上下文",
                source_mode="text",
            )
            service.append_message(
                conversation_id=conversation.id,
                role="user",
                content="你好",
                source_mode="text",
            )

            chat_ctx = service.build_chat_context(conversation.id)

            self.assertEqual(len(chat_ctx.items), 2)
            self.assertEqual(chat_ctx.items[0].role, "system")
            self.assertEqual(chat_ctx.items[0].text_content, "仅供模型参考的上下文")
            self.assertEqual(chat_ctx.items[1].role, "user")
            self.assertEqual(chat_ctx.items[1].text_content, "你好")

    def test_conversation_persists_agent_profile_id(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            db_path = root / "app.db"
            ensure_database(db_path)
            knowledge_service = KnowledgeService(
                db_path=db_path,
                files_root=root / "files",
                chroma_root=root / "chroma",
            )
            conversation_service = ConversationService(db_path=db_path)
            profile_service = ProfileService(db_path=db_path)

            chat_model = profile_service.create_chat_model_profile(
                name="default-model",
                provider="openai_compatible",
                model="gpt-4.1-mini",
                base_url="https://api.openai.com/v1",
                api_key="test-key",
                is_default=True,
            )
            agent = profile_service.create_agent_profile(
                name="默认顾问",
                description="",
                opening_message="你好，我是默认顾问。",
                idle_timeout_seconds=10.0,
                max_idle_reminders=1,
                idle_reminder_message="喂，您还在吗？",
                idle_goodbye_message="我先不打扰您了。",
                system_prompt="",
                fallback_prompt="",
                chat_model_profile_id=chat_model.id,
                retrieval_top_k=5,
                knowledge_base_ids=[],
                is_default=True,
            )

            conversation = conversation_service.create_conversation(
                title="agent-session",
                agent_profile_id=agent.id,
            )
            self.assertEqual(conversation.agent_profile_id, agent.id)

            ensured = conversation_service.ensure_conversation(
                conversation.id,
                knowledge_base_id=None,
                agent_profile_id=agent.id,
                last_mode="voice",
            )
            self.assertEqual(ensured.agent_profile_id, agent.id)
            self.assertEqual(ensured.last_mode, "voice")

    def test_end_conversation_persists_reason(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "app.db"
            ensure_database(db_path)
            conversation_service = ConversationService(db_path=db_path)

            conversation = conversation_service.create_conversation(title="call-1", last_mode="voice")
            ended = conversation_service.end_conversation(
                conversation.id,
                reason="away_timeout",
                detail="participant_disconnected",
            )

            self.assertIsNotNone(ended)
            assert ended is not None
            self.assertEqual(ended.status, "ended")
            self.assertEqual(ended.end_reason, "away_timeout")
            self.assertEqual(ended.end_detail, "participant_disconnected")
            self.assertIsNotNone(ended.ended_at)


if __name__ == "__main__":
    unittest.main()
