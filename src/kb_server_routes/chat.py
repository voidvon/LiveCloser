from __future__ import annotations

from fastapi import FastAPI, HTTPException

from kb_server_schemas import (
    ConversationEndPayload,
    ConversationEnsurePayload,
    ConversationMessagePayload,
    ConversationPayload,
    ConversationUpdatePayload,
)
from livekit_sales_agent.conversation import ConversationService
from livekit_sales_agent.conversation.service import _UNSET


def register_chat_routes(app: FastAPI, *, conversation_service: ConversationService) -> None:
    @app.get("/chat/conversations")
    def list_conversations():
        return conversation_service.list_conversations()

    @app.post("/chat/conversations")
    def create_conversation(payload: ConversationPayload):
        return conversation_service.create_conversation(
            title=payload.title,
            knowledge_base_id=payload.knowledge_base_id,
            agent_profile_id=payload.agent_profile_id,
            last_mode=payload.last_mode,
        )

    @app.post("/chat/conversations/ensure")
    def ensure_conversation(payload: ConversationEnsurePayload):
        return conversation_service.ensure_conversation(
            payload.conversation_id,
            knowledge_base_id=payload.knowledge_base_id,
            agent_profile_id=payload.agent_profile_id,
            last_mode=payload.last_mode,
        )

    @app.get("/chat/conversations/{conversation_id}")
    def get_conversation(conversation_id: str):
        record = conversation_service.get_conversation(conversation_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return record

    @app.patch("/chat/conversations/{conversation_id}")
    def update_conversation(conversation_id: str, payload: ConversationUpdatePayload):
        values = payload.model_dump(exclude_unset=True)
        record = conversation_service.update_conversation(
            conversation_id,
            title=values["title"] if "title" in values else _UNSET,
            knowledge_base_id=values["knowledge_base_id"] if "knowledge_base_id" in values else _UNSET,
            agent_profile_id=values["agent_profile_id"] if "agent_profile_id" in values else _UNSET,
            last_mode=values["last_mode"] if "last_mode" in values else _UNSET,
        )
        if record is None:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return record

    @app.delete("/chat/conversations/{conversation_id}")
    def delete_conversation(conversation_id: str):
        deleted = conversation_service.delete_conversation(conversation_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return {"ok": True}

    @app.get("/chat/conversations/{conversation_id}/messages")
    def list_conversation_messages(conversation_id: str):
        record = conversation_service.get_conversation(conversation_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return conversation_service.list_messages(conversation_id)

    @app.post("/chat/conversations/{conversation_id}/messages")
    def append_conversation_message(
        conversation_id: str,
        payload: ConversationMessagePayload,
    ):
        record = conversation_service.get_conversation(conversation_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return conversation_service.append_message(
            conversation_id=conversation_id,
            role=payload.role,
            content=payload.content,
            source_mode=payload.source_mode,
            external_message_id=payload.external_message_id,
        )

    @app.post("/chat/conversations/{conversation_id}/end")
    def end_conversation(conversation_id: str, payload: ConversationEndPayload):
        record = conversation_service.end_conversation(
            conversation_id,
            reason=payload.reason,
            detail=payload.detail,
        )
        if record is None:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return record
