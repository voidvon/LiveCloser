from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from .constants import UNSET
from .models import ConversationMessageRecord, ConversationRecord

_UNSET = UNSET


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_conversation(row: sqlite3.Row) -> ConversationRecord:
    return ConversationRecord(**dict(row))


def _row_to_message(row: sqlite3.Row) -> ConversationMessageRecord:
    return ConversationMessageRecord(**dict(row))


class ConversationRepository:
    def __init__(self, conn: sqlite3.Connection):
        self._conn = conn

    def list_conversations(self) -> list[ConversationRecord]:
        rows = self._conn.execute(
            """
            SELECT *
            FROM chat_conversations
            ORDER BY
                COALESCE(last_message_at, created_at) DESC,
                updated_at DESC
            """
        ).fetchall()
        return [_row_to_conversation(row) for row in rows]

    def get_conversation(self, conversation_id: str) -> Optional[ConversationRecord]:
        row = self._conn.execute(
            "SELECT * FROM chat_conversations WHERE id = ?",
            (conversation_id,),
        ).fetchone()
        return _row_to_conversation(row) if row else None

    def create_conversation(
        self,
        *,
        title: str,
        knowledge_base_id: Optional[str],
        last_mode: str,
    ) -> ConversationRecord:
        record_id = str(uuid4())
        now = utc_now()
        self._conn.execute(
            """
            INSERT INTO chat_conversations (
                id, title, knowledge_base_id, last_mode, created_at, updated_at, last_message_at, last_message_preview
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, '')
            """,
            (record_id, title, knowledge_base_id, last_mode, now, now, None),
        )
        self._conn.commit()
        record = self.get_conversation(record_id)
        assert record is not None
        return record

    def update_conversation(
        self,
        conversation_id: str,
        *,
        title: str | object = _UNSET,
        knowledge_base_id: Optional[str] | object = _UNSET,
        last_mode: str | object = _UNSET,
    ) -> Optional[ConversationRecord]:
        current = self.get_conversation(conversation_id)
        if current is None:
            return None

        now = utc_now()
        self._conn.execute(
            """
            UPDATE chat_conversations
            SET title = ?, knowledge_base_id = ?, last_mode = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                current.title if title is _UNSET else title,
                current.knowledge_base_id
                if knowledge_base_id is _UNSET
                else knowledge_base_id,
                current.last_mode if last_mode is _UNSET else last_mode,
                now,
                conversation_id,
            ),
        )
        self._conn.commit()
        return self.get_conversation(conversation_id)

    def delete_conversation(self, conversation_id: str) -> bool:
        result = self._conn.execute(
            "DELETE FROM chat_conversations WHERE id = ?",
            (conversation_id,),
        )
        self._conn.commit()
        return result.rowcount > 0

    def touch_conversation(
        self,
        conversation_id: str,
        *,
        last_mode: str,
        preview: str,
        last_message_at: str,
    ) -> Optional[ConversationRecord]:
        self._conn.execute(
            """
            UPDATE chat_conversations
            SET last_mode = ?, updated_at = ?, last_message_at = ?, last_message_preview = ?
            WHERE id = ?
            """,
            (last_mode, last_message_at, last_message_at, preview, conversation_id),
        )
        self._conn.commit()
        return self.get_conversation(conversation_id)

    def list_messages(self, conversation_id: str) -> list[ConversationMessageRecord]:
        rows = self._conn.execute(
            """
            SELECT *
            FROM chat_messages
            WHERE conversation_id = ?
            ORDER BY created_at ASC, id ASC
            """,
            (conversation_id,),
        ).fetchall()
        return [_row_to_message(row) for row in rows]

    def get_message_by_external_id(
        self,
        conversation_id: str,
        external_message_id: str,
    ) -> Optional[ConversationMessageRecord]:
        row = self._conn.execute(
            """
            SELECT *
            FROM chat_messages
            WHERE conversation_id = ? AND external_message_id = ?
            """,
            (conversation_id, external_message_id),
        ).fetchone()
        return _row_to_message(row) if row else None

    def create_message(
        self,
        *,
        conversation_id: str,
        role: str,
        content: str,
        source_mode: str,
        external_message_id: Optional[str] = None,
        created_at: Optional[str] = None,
    ) -> ConversationMessageRecord:
        now = created_at or utc_now()
        if external_message_id:
            existing = self.get_message_by_external_id(conversation_id, external_message_id)
            if existing is not None:
                return existing

        record_id = str(uuid4())
        self._conn.execute(
            """
            INSERT INTO chat_messages (
                id, conversation_id, external_message_id, role, content, source_mode, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record_id,
                conversation_id,
                external_message_id,
                role,
                content,
                source_mode,
                now,
            ),
        )
        preview = content.strip().replace("\n", " ")[:160]
        self.touch_conversation(
            conversation_id,
            last_mode=source_mode,
            preview=preview,
            last_message_at=now,
        )
        row = self._conn.execute(
            "SELECT * FROM chat_messages WHERE id = ?",
            (record_id,),
        ).fetchone()
        self._conn.commit()
        assert row is not None
        return _row_to_message(row)
