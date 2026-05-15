from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


def _default_kb_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "knowledge"


def _default_kb_data_dir() -> Path:
    return Path(__file__).resolve().parents[2] / ".data" / "kb"


def _parse_id_list(raw_value: str) -> list[str]:
    values: list[str] = []
    seen: set[str] = set()
    for part in raw_value.split(","):
        value = part.strip()
        if not value or value in seen:
            continue
        values.append(value)
        seen.add(value)
    return values


@dataclass
class Settings:
    agent_name: str
    kb_dir: Path
    kb_data_dir: Path
    kb_api_url: str
    kb_top_k: int
    price_stale_after_days: int
    stt_fallback_profile_ids: list[str]
    tts_fallback_profile_ids: list[str]

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
            kb_api_url=os.getenv("KB_API_URL", "http://127.0.0.1:8001").rstrip("/"),
            kb_top_k=int(os.getenv("KB_TOP_K", "3")),
            price_stale_after_days=int(os.getenv("PRICE_STALE_AFTER_DAYS", "3")),
            stt_fallback_profile_ids=_parse_id_list(os.getenv("STT_FALLBACK_PROFILE_IDS", "")),
            tts_fallback_profile_ids=_parse_id_list(os.getenv("TTS_FALLBACK_PROFILE_IDS", "")),
        )

    def validate(self) -> None:
        return None


@dataclass
class ChatModelSettings:
    model: str
    base_url: str
    api_key: str

    @property
    def is_deepseek_v4(self) -> bool:
        normalized_base_url = self.base_url.rstrip("/").lower()
        normalized_model = self.model.strip().lower()
        return "api.deepseek.com" in normalized_base_url and normalized_model in {
            "deepseek-v4-flash",
            "deepseek-v4-pro",
        }


@dataclass
class SttModelSettings:
    provider: str
    auth_mode: str
    api_key: str
    app_id: str
    access_token: str
    uid: str
    resource_id: str
    cluster: str
    ws_url: str
    language: str


@dataclass
class TtsModelSettings:
    provider: str
    auth_mode: str
    api_key: str
    app_id: str
    access_token: str
    uid: str
    resource_id: str
    cluster: str
    http_url: str
    voice_type: str
    encoding: str
    sample_rate: int
    speed_ratio: float
    volume_ratio: float
    pitch_ratio: float


@dataclass
class AgentProfileSettings:
    profile_id: Optional[str]
    name: str
    description: str
    opening_message: str
    idle_timeout_seconds: float
    max_idle_reminders: int
    idle_reminder_message: str
    idle_goodbye_message: str
    system_prompt: str
    fallback_prompt: str
    retrieval_top_k: int
    knowledge_base_ids: list[str]
    chat_model: ChatModelSettings
