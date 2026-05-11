from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from livekit_sales_agent.knowledge.db import connect
from livekit_sales_agent.knowledge.repositories import KnowledgeBaseRepository


def _default_kb_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "knowledge"


def _default_kb_data_dir() -> Path:
    return Path(__file__).resolve().parents[2] / ".data" / "kb"


@dataclass
class Settings:
    agent_name: str
    kb_dir: Path
    kb_data_dir: Path
    kb_top_k: int
    price_stale_after_days: int
    stt_descriptor: Optional[str]
    tts_descriptor: Optional[str]
    doubao_api_key: Optional[str]
    doubao_stt_resource_id: Optional[str]
    doubao_tts_resource_id: Optional[str]
    doubao_app_id: Optional[str]
    doubao_access_token: Optional[str]
    doubao_secret_key: Optional[str]
    doubao_uid: str
    doubao_stt_ws_url: str
    doubao_stt_cluster: Optional[str]
    doubao_stt_language: str
    doubao_stt_workflow: str
    doubao_tts_http_url: str
    doubao_tts_cluster: Optional[str]
    doubao_tts_voice_type: Optional[str]
    doubao_tts_encoding: str
    doubao_tts_sample_rate: int
    doubao_tts_speed_ratio: float
    doubao_tts_volume_ratio: float
    doubao_tts_pitch_ratio: float

    @classmethod
    def from_env(cls) -> "Settings":
        kb_dir = Path(os.getenv("KB_DIR", str(_default_kb_dir()))).expanduser()
        if not kb_dir.is_absolute():
            kb_dir = Path.cwd() / kb_dir
        kb_data_dir = Path(os.getenv("KB_DATA_DIR", str(_default_kb_data_dir()))).expanduser()
        if not kb_data_dir.is_absolute():
            kb_data_dir = Path.cwd() / kb_data_dir

        return cls(
            agent_name=os.getenv("AGENT_NAME", "sales-kb-agent"),
            kb_dir=kb_dir,
            kb_data_dir=kb_data_dir,
            kb_top_k=int(os.getenv("KB_TOP_K", "3")),
            price_stale_after_days=int(os.getenv("PRICE_STALE_AFTER_DAYS", "3")),
            stt_descriptor=_optional_env("STT_DESCRIPTOR"),
            tts_descriptor=_optional_env("TTS_DESCRIPTOR"),
            doubao_api_key=_optional_env("DOUBAO_API_KEY"),
            doubao_stt_resource_id=_optional_env("DOUBAO_STT_RESOURCE_ID"),
            doubao_tts_resource_id=_optional_env("DOUBAO_TTS_RESOURCE_ID"),
            doubao_app_id=_optional_env("DOUBAO_APP_ID"),
            doubao_access_token=_optional_env("DOUBAO_ACCESS_TOKEN"),
            doubao_secret_key=_optional_env("DOUBAO_SECRET_KEY"),
            doubao_uid=os.getenv("DOUBAO_UID", "livekit-sales-user"),
            doubao_stt_ws_url=os.getenv(
                "DOUBAO_STT_WS_URL",
                "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async",
            ),
            doubao_stt_cluster=_optional_env("DOUBAO_STT_CLUSTER"),
            doubao_stt_language=os.getenv("DOUBAO_STT_LANGUAGE", "zh-CN"),
            doubao_stt_workflow=os.getenv(
                "DOUBAO_STT_WORKFLOW",
                "audio_in,resample,partition,vad,fe,decode,itn,nlu_punctuate",
            ),
            doubao_tts_http_url=os.getenv(
                "DOUBAO_TTS_HTTP_URL",
                "https://openspeech.bytedance.com/api/v3/tts/unidirectional",
            ),
            doubao_tts_cluster=_optional_env("DOUBAO_TTS_CLUSTER"),
            doubao_tts_voice_type=_optional_env("DOUBAO_TTS_VOICE_TYPE"),
            doubao_tts_encoding=os.getenv("DOUBAO_TTS_ENCODING", "mp3"),
            doubao_tts_sample_rate=int(os.getenv("DOUBAO_TTS_SAMPLE_RATE", "24000")),
            doubao_tts_speed_ratio=float(os.getenv("DOUBAO_TTS_SPEED_RATIO", "1.0")),
            doubao_tts_volume_ratio=float(os.getenv("DOUBAO_TTS_VOLUME_RATIO", "1.0")),
            doubao_tts_pitch_ratio=float(os.getenv("DOUBAO_TTS_PITCH_RATIO", "1.0")),
        )

    def validate(self) -> None:
        self._validate_doubao_voice()

    def _validate_doubao_voice(self) -> None:
        if self.uses_doubao_stt or self.uses_doubao_tts:
            if not self.has_doubao_new_auth and not self.has_doubao_legacy_auth:
                raise ValueError(
                    "Missing required Doubao authentication. "
                    "Set DOUBAO_API_KEY for the new console, or DOUBAO_APP_ID + "
                    "DOUBAO_ACCESS_TOKEN for the legacy console."
                )

        if self.uses_doubao_stt and not self.doubao_stt_resource_id and not self.doubao_stt_cluster:
            raise ValueError(
                "Missing required STT target. Set DOUBAO_STT_RESOURCE_ID for the new "
                "console, or DOUBAO_STT_CLUSTER for the legacy console."
            )

        if self.uses_doubao_tts:
            missing = []
            if not self.doubao_tts_resource_id and not self.doubao_tts_cluster:
                missing.append("DOUBAO_TTS_RESOURCE_ID or DOUBAO_TTS_CLUSTER")
            if not self.doubao_tts_voice_type:
                missing.append("DOUBAO_TTS_VOICE_TYPE")
            if missing:
                raise ValueError(
                    "Missing required Doubao TTS environment variables: "
                    + ", ".join(missing)
                )

    @property
    def uses_doubao_stt(self) -> bool:
        return (self.stt_descriptor or "").strip().lower() == "doubao"

    @property
    def uses_doubao_tts(self) -> bool:
        return (self.tts_descriptor or "").strip().lower() == "doubao"

    @property
    def has_doubao_new_auth(self) -> bool:
        return bool(self.doubao_api_key)

    @property
    def has_doubao_legacy_auth(self) -> bool:
        return bool(self.doubao_app_id and self.doubao_access_token)


def _optional_env(name: str) -> Optional[str]:
    value = os.getenv(name, "").strip()
    return value or None


@dataclass
class ChatModelSettings:
    model: str
    base_url: str
    api_key: str


def load_chat_model_settings(db_path: Path) -> ChatModelSettings:
    with connect(db_path) as conn:
        repo = KnowledgeBaseRepository(conn)
        record = repo.get_default_chat_model_profile()

    if record is None:
        raise ValueError("No default chat model configured in settings")
    if not record.model:
        raise ValueError("Default chat model is missing model ID")
    if not record.base_url:
        raise ValueError("Default chat model is missing base URL")
    if not record.api_key:
        raise ValueError("Default chat model is missing API key")

    return ChatModelSettings(
        model=record.model,
        base_url=record.base_url,
        api_key=record.api_key,
    )
