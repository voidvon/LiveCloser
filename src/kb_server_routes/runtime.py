from __future__ import annotations

from dataclasses import asdict
from typing import Optional

from fastapi import FastAPI

from kb_server_schemas import FallbackProfilesPayload
from livekit_sales_agent.profiles import ProfileService


def register_runtime_routes(app: FastAPI, *, profile_service: ProfileService) -> None:
    @app.get("/agent-runtime/profile")
    def get_runtime_agent_profile(
        agent_profile_id: Optional[str] = None,
        default_retrieval_top_k: int = 3,
    ):
        return asdict(
            profile_service.load_agent_profile_settings(
                agent_profile_id=agent_profile_id,
                default_retrieval_top_k=default_retrieval_top_k,
            )
        )

    @app.get("/agent-runtime/stt-model")
    def get_runtime_stt_model(profile_id: Optional[str] = None):
        record = profile_service.load_stt_model_settings(profile_id=profile_id)
        return asdict(record) if record is not None else None

    @app.post("/agent-runtime/stt-fallback-models")
    def get_runtime_stt_fallback_models(payload: FallbackProfilesPayload):
        return [
            asdict(item)
            for item in profile_service.load_stt_fallback_model_settings(
                profile_ids=payload.profile_ids,
            )
        ]

    @app.get("/agent-runtime/tts-model")
    def get_runtime_tts_model(profile_id: Optional[str] = None):
        record = profile_service.load_tts_model_settings(profile_id=profile_id)
        return asdict(record) if record is not None else None

    @app.post("/agent-runtime/tts-fallback-models")
    def get_runtime_tts_fallback_models(payload: FallbackProfilesPayload):
        return [
            asdict(item)
            for item in profile_service.load_tts_fallback_model_settings(
                profile_ids=payload.profile_ids,
            )
        ]
