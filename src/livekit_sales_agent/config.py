from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from livekit_sales_agent.defaults import (
    DEFAULT_IDLE_GOODBYE_MESSAGE,
    DEFAULT_IDLE_REMINDER_MESSAGE,
    DEFAULT_IDLE_TIMEOUT_SECONDS,
    DEFAULT_MAX_IDLE_REMINDERS,
    DEFAULT_OPENING_MESSAGE,
)
from livekit_sales_agent.knowledge.db import connect
from livekit_sales_agent.knowledge.repositories import KnowledgeBaseRepository


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


def load_chat_model_settings(db_path: Path) -> ChatModelSettings:
    with connect(db_path) as conn:
        repo = KnowledgeBaseRepository(conn)
        record = repo.get_default_chat_model_profile()
    return _chat_model_settings_from_record(record)


def _chat_model_settings_from_record(record) -> ChatModelSettings:
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


def load_agent_profile_settings(
    db_path: Path,
    *,
    agent_profile_id: Optional[str],
    default_retrieval_top_k: int,
) -> AgentProfileSettings:
    with connect(db_path) as conn:
        repo = KnowledgeBaseRepository(conn)
        profile = repo.get_agent_profile(agent_profile_id) if agent_profile_id else None
        if profile is None:
            profile = repo.get_default_agent_profile()

        if profile is None:
            return AgentProfileSettings(
                profile_id=None,
                name="系统默认智能体",
                description="",
                opening_message=DEFAULT_OPENING_MESSAGE,
                idle_timeout_seconds=DEFAULT_IDLE_TIMEOUT_SECONDS,
                max_idle_reminders=DEFAULT_MAX_IDLE_REMINDERS,
                idle_reminder_message=DEFAULT_IDLE_REMINDER_MESSAGE,
                idle_goodbye_message=DEFAULT_IDLE_GOODBYE_MESSAGE,
                system_prompt="",
                fallback_prompt="",
                retrieval_top_k=default_retrieval_top_k,
                knowledge_base_ids=[],
                chat_model=_chat_model_settings_from_record(repo.get_default_chat_model_profile()),
            )

        model_record = (
            repo.get_chat_model_profile(profile.chat_model_profile_id)
            if profile.chat_model_profile_id
            else repo.get_default_chat_model_profile()
        )
        if model_record is None:
            raise ValueError("智能体绑定的对话模型不存在")

        return AgentProfileSettings(
            profile_id=profile.id,
            name=profile.name,
            description=profile.description,
            opening_message=profile.opening_message,
            idle_timeout_seconds=max(0.0, float(profile.idle_timeout_seconds)),
            max_idle_reminders=max(0, int(profile.max_idle_reminders)),
            idle_reminder_message=profile.idle_reminder_message or DEFAULT_IDLE_REMINDER_MESSAGE,
            idle_goodbye_message=profile.idle_goodbye_message or DEFAULT_IDLE_GOODBYE_MESSAGE,
            system_prompt=profile.system_prompt,
            fallback_prompt=profile.fallback_prompt,
            retrieval_top_k=profile.retrieval_top_k,
            knowledge_base_ids=list(profile.knowledge_base_ids or []),
            chat_model=_chat_model_settings_from_record(model_record),
        )


def _stt_model_settings_from_record(record) -> Optional[SttModelSettings]:
    if record is None:
        return None
    if not record.provider:
        raise ValueError("Default STT model is missing provider")
    if not record.resource_id and not record.cluster:
        raise ValueError("Default STT model is missing resource ID or cluster")
    if record.auth_mode == "api_key" and not record.api_key:
        raise ValueError("Default STT model is missing API key")
    if record.auth_mode == "legacy" and (not record.app_id or not record.access_token):
        raise ValueError("Default STT model is missing legacy credentials")

    return SttModelSettings(
        provider=record.provider,
        auth_mode=record.auth_mode,
        api_key=record.api_key,
        app_id=record.app_id,
        access_token=record.access_token,
        uid=record.uid,
        resource_id=record.resource_id,
        cluster=record.cluster,
        ws_url=record.ws_url,
        language=record.language,
    )


def load_stt_model_settings(db_path: Path, *, profile_id: Optional[str] = None) -> Optional[SttModelSettings]:
    with connect(db_path) as conn:
        repo = KnowledgeBaseRepository(conn)
        record = repo.get_stt_model_profile(profile_id) if profile_id else repo.get_default_stt_model_profile()
    return _stt_model_settings_from_record(record)


def load_stt_fallback_model_settings(
    db_path: Path,
    *,
    profile_ids: list[str],
) -> list[SttModelSettings]:
    loaded: list[SttModelSettings] = []
    for profile_id in profile_ids:
        settings = load_stt_model_settings(db_path, profile_id=profile_id)
        if settings is not None:
            loaded.append(settings)
    return loaded


def _tts_model_settings_from_record(record) -> Optional[TtsModelSettings]:
    if record is None:
        return None
    if not record.provider:
        raise ValueError("Default TTS model is missing provider")
    if not record.resource_id and not record.cluster:
        raise ValueError("Default TTS model is missing resource ID or cluster")
    if not record.voice_type:
        raise ValueError("Default TTS model is missing voice type")
    if record.auth_mode == "api_key" and not record.api_key:
        raise ValueError("Default TTS model is missing API key")
    if record.auth_mode == "legacy" and (not record.app_id or not record.access_token):
        raise ValueError("Default TTS model is missing legacy credentials")

    return TtsModelSettings(
        provider=record.provider,
        auth_mode=record.auth_mode,
        api_key=record.api_key,
        app_id=record.app_id,
        access_token=record.access_token,
        uid=record.uid,
        resource_id=record.resource_id,
        cluster=record.cluster,
        http_url=record.http_url,
        voice_type=record.voice_type,
        encoding=record.encoding,
        sample_rate=record.sample_rate,
        speed_ratio=record.speed_ratio,
        volume_ratio=record.volume_ratio,
        pitch_ratio=record.pitch_ratio,
    )


def load_tts_model_settings(db_path: Path, *, profile_id: Optional[str] = None) -> Optional[TtsModelSettings]:
    with connect(db_path) as conn:
        repo = KnowledgeBaseRepository(conn)
        record = repo.get_tts_model_profile(profile_id) if profile_id else repo.get_default_tts_model_profile()
    return _tts_model_settings_from_record(record)


def load_tts_fallback_model_settings(
    db_path: Path,
    *,
    profile_ids: list[str],
) -> list[TtsModelSettings]:
    loaded: list[TtsModelSettings] = []
    for profile_id in profile_ids:
        settings = load_tts_model_settings(db_path, profile_id=profile_id)
        if settings is not None:
            loaded.append(settings)
    return loaded
