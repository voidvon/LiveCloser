from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class ConversationRecord:
    id: str
    title: str
    knowledge_base_id: Optional[str]
    agent_profile_id: Optional[str]
    last_mode: str
    status: str
    ended_at: Optional[str]
    end_reason: str
    end_detail: str
    created_at: str
    updated_at: str
    last_message_at: Optional[str]
    last_message_preview: str


@dataclass
class ConversationMessageRecord:
    id: str
    conversation_id: str
    external_message_id: Optional[str]
    role: str
    content: str
    source_mode: str
    created_at: str
