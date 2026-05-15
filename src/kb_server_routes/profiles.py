from __future__ import annotations

from fastapi import FastAPI, HTTPException

from kb_server_schemas import (
    AgentProfilePayload,
    ChatModelProfilePayload,
    EmbeddingProfilePayload,
    SttModelProfilePayload,
    TtsModelProfilePayload,
)
from livekit_sales_agent.profiles import ProfileService


def register_profile_routes(app: FastAPI, *, profile_service: ProfileService) -> None:
    @app.get("/embedding-profiles")
    def list_embedding_profiles():
        return profile_service.list_embedding_profiles()

    @app.get("/chat-model-profiles")
    def list_chat_model_profiles():
        return profile_service.list_chat_model_profiles()

    @app.get("/agent-profiles")
    def list_agent_profiles():
        return profile_service.list_agent_profiles()

    @app.get("/stt-model-profiles")
    def list_stt_model_profiles():
        return profile_service.list_stt_model_profiles()

    @app.get("/tts-model-profiles")
    def list_tts_model_profiles():
        return profile_service.list_tts_model_profiles()

    @app.post("/chat-model-profiles")
    def create_chat_model_profile(payload: ChatModelProfilePayload):
        return profile_service.create_chat_model_profile(**payload.model_dump())

    @app.post("/agent-profiles")
    def create_agent_profile(payload: AgentProfilePayload):
        try:
            return profile_service.create_agent_profile(**payload.model_dump())
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.patch("/agent-profiles/{profile_id}")
    def update_agent_profile(profile_id: str, payload: AgentProfilePayload):
        try:
            record = profile_service.update_agent_profile(profile_id, **payload.model_dump())
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if record is None:
            raise HTTPException(status_code=404, detail="Agent profile not found")
        return record

    @app.delete("/agent-profiles/{profile_id}")
    def delete_agent_profile(profile_id: str):
        deleted = profile_service.delete_agent_profile(profile_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Agent profile not found")
        return {"ok": True}

    @app.patch("/chat-model-profiles/{profile_id}")
    def update_chat_model_profile(profile_id: str, payload: ChatModelProfilePayload):
        record = profile_service.update_chat_model_profile(profile_id, **payload.model_dump())
        if record is None:
            raise HTTPException(status_code=404, detail="Chat model profile not found")
        return record

    @app.post("/chat-model-profiles/{profile_id}/default")
    def set_default_chat_model_profile(profile_id: str):
        record = profile_service.set_default_chat_model_profile(profile_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Chat model profile not found")
        return record

    @app.delete("/chat-model-profiles/{profile_id}")
    def delete_chat_model_profile(profile_id: str):
        deleted = profile_service.delete_chat_model_profile(profile_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Chat model profile not found")
        return {"ok": True}

    @app.post("/stt-model-profiles")
    def create_stt_model_profile(payload: SttModelProfilePayload):
        return profile_service.create_stt_model_profile(**payload.model_dump())

    @app.patch("/stt-model-profiles/{profile_id}")
    def update_stt_model_profile(profile_id: str, payload: SttModelProfilePayload):
        record = profile_service.update_stt_model_profile(profile_id, **payload.model_dump())
        if record is None:
            raise HTTPException(status_code=404, detail="STT model profile not found")
        return record

    @app.post("/stt-model-profiles/{profile_id}/default")
    def set_default_stt_model_profile(profile_id: str):
        record = profile_service.set_default_stt_model_profile(profile_id)
        if record is None:
            raise HTTPException(status_code=404, detail="STT model profile not found")
        return record

    @app.delete("/stt-model-profiles/{profile_id}")
    def delete_stt_model_profile(profile_id: str):
        deleted = profile_service.delete_stt_model_profile(profile_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="STT model profile not found")
        return {"ok": True}

    @app.post("/tts-model-profiles")
    def create_tts_model_profile(payload: TtsModelProfilePayload):
        return profile_service.create_tts_model_profile(**payload.model_dump())

    @app.patch("/tts-model-profiles/{profile_id}")
    def update_tts_model_profile(profile_id: str, payload: TtsModelProfilePayload):
        record = profile_service.update_tts_model_profile(profile_id, **payload.model_dump())
        if record is None:
            raise HTTPException(status_code=404, detail="TTS model profile not found")
        return record

    @app.post("/tts-model-profiles/{profile_id}/default")
    def set_default_tts_model_profile(profile_id: str):
        record = profile_service.set_default_tts_model_profile(profile_id)
        if record is None:
            raise HTTPException(status_code=404, detail="TTS model profile not found")
        return record

    @app.delete("/tts-model-profiles/{profile_id}")
    def delete_tts_model_profile(profile_id: str):
        deleted = profile_service.delete_tts_model_profile(profile_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="TTS model profile not found")
        return {"ok": True}

    @app.post("/embedding-profiles")
    def create_embedding_profile(payload: EmbeddingProfilePayload):
        return profile_service.create_embedding_profile(**payload.model_dump())

    @app.patch("/embedding-profiles/{profile_id}")
    def update_embedding_profile(profile_id: str, payload: EmbeddingProfilePayload):
        record = profile_service.update_embedding_profile(profile_id, **payload.model_dump())
        if record is None:
            raise HTTPException(status_code=404, detail="Embedding profile not found")
        return record

    @app.delete("/embedding-profiles/{profile_id}")
    def delete_embedding_profile(profile_id: str):
        deleted, in_use = profile_service.delete_embedding_profile(profile_id)
        if in_use:
            raise HTTPException(
                status_code=409,
                detail="Embedding profile is still used by knowledge bases",
            )
        if not deleted:
            raise HTTPException(status_code=404, detail="Embedding profile not found")
        return {"ok": True}
