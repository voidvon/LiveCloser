from __future__ import annotations

from pathlib import Path
from typing import Optional

from livekit.agents import ChatContext

from livekit_sales_agent.knowledge.db import connect

from .repositories import ConversationRepository

_UNSET = object()


class ConversationService:
    def __init__(self, *, db_path: Path):
        self._db_path = db_path

    def list_conversations(self):
        with connect(self._db_path) as conn:
            repo = ConversationRepository(conn)
            return repo.list_conversations()

    def create_conversation(
        self,
        *,
        title: str = "新会话",
        knowledge_base_id: Optional[str] = None,
        last_mode: str = "text",
    ):
        with connect(self._db_path) as conn:
            repo = ConversationRepository(conn)
            return repo.create_conversation(
                title=title,
                knowledge_base_id=knowledge_base_id,
                last_mode=last_mode,
            )

    def get_conversation(self, conversation_id: str):
        with connect(self._db_path) as conn:
            repo = ConversationRepository(conn)
            return repo.get_conversation(conversation_id)

    def update_conversation(
        self,
        conversation_id: str,
        *,
        title: str | object = _UNSET,
        knowledge_base_id: Optional[str] | object = _UNSET,
        last_mode: str | object = _UNSET,
    ):
        with connect(self._db_path) as conn:
            repo = ConversationRepository(conn)
            return repo.update_conversation(
                conversation_id,
                title=title,
                knowledge_base_id=knowledge_base_id,
                last_mode=last_mode,
            )

    def ensure_conversation(
        self,
        conversation_id: Optional[str],
        *,
        knowledge_base_id: Optional[str],
        last_mode: str,
    ):
        with connect(self._db_path) as conn:
            repo = ConversationRepository(conn)
            if conversation_id:
                record = repo.get_conversation(conversation_id)
                if record is not None:
                    if record.knowledge_base_id != knowledge_base_id or record.last_mode != last_mode:
                        record = repo.update_conversation(
                            conversation_id,
                            knowledge_base_id=knowledge_base_id,
                            last_mode=last_mode,
                        )
                    return record
            return repo.create_conversation(
                title="新会话",
                knowledge_base_id=knowledge_base_id,
                last_mode=last_mode,
            )

    def list_messages(self, conversation_id: str):
        with connect(self._db_path) as conn:
            repo = ConversationRepository(conn)
            return repo.list_messages(conversation_id)

    def append_message(
        self,
        *,
        conversation_id: str,
        role: str,
        content: str,
        source_mode: str,
        external_message_id: Optional[str] = None,
    ):
        with connect(self._db_path) as conn:
            repo = ConversationRepository(conn)
            return repo.create_message(
                conversation_id=conversation_id,
                role=role,
                content=content,
                source_mode=source_mode,
                external_message_id=external_message_id,
            )

    def build_chat_context(self, conversation_id: str) -> ChatContext:
        chat_ctx = ChatContext.empty()
        for message in self.list_messages(conversation_id):
            if not message.content.strip():
                continue
            if message.role not in {"user", "assistant", "system", "developer"}:
                continue
            chat_ctx.add_message(role=message.role, content=message.content)
        return chat_ctx
