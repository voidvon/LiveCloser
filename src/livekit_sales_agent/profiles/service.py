from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Optional

from livekit_sales_agent.config import (
    AgentProfileSettings,
    ChatModelSettings,
    SttModelSettings,
    TtsModelSettings,
)
from livekit_sales_agent.defaults import (
    DEFAULT_IDLE_GOODBYE_MESSAGE,
    DEFAULT_IDLE_REMINDER_MESSAGE,
    DEFAULT_IDLE_TIMEOUT_SECONDS,
    DEFAULT_MAX_IDLE_REMINDERS,
    DEFAULT_OPENING_MESSAGE,
)
from livekit_sales_agent.knowledge.db import connect, unit_of_work
from livekit_sales_agent.knowledge.repositories import KnowledgeBaseRepository
from livekit_sales_agent.profiles.repository import ProfileRepository


class ProfileService:
    def __init__(self, *, db_path: Path):
        self._db_path = db_path

    def load_chat_model_settings(self) -> ChatModelSettings:
        with connect(self._db_path) as conn:
            repo = ProfileRepository(conn)
            record = repo.get_default_chat_model_profile()
        return self._chat_model_settings_from_record(record)

    def load_agent_profile_settings(
        self,
        *,
        agent_profile_id: Optional[str],
        default_retrieval_top_k: int,
    ) -> AgentProfileSettings:
        with connect(self._db_path) as conn:
            repo = ProfileRepository(conn)
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
                    chat_model=self._chat_model_settings_from_record(
                        repo.get_default_chat_model_profile()
                    ),
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
                chat_model=self._chat_model_settings_from_record(model_record),
            )

    def load_stt_model_settings(
        self,
        *,
        profile_id: Optional[str] = None,
    ) -> Optional[SttModelSettings]:
        with connect(self._db_path) as conn:
            repo = ProfileRepository(conn)
            record = (
                repo.get_stt_model_profile(profile_id)
                if profile_id
                else repo.get_default_stt_model_profile()
            )
        return self._stt_model_settings_from_record(record)

    def load_stt_fallback_model_settings(
        self,
        *,
        profile_ids: list[str],
    ) -> list[SttModelSettings]:
        loaded: list[SttModelSettings] = []
        for profile_id in profile_ids:
            settings = self.load_stt_model_settings(profile_id=profile_id)
            if settings is not None:
                loaded.append(settings)
        return loaded

    def load_tts_model_settings(
        self,
        *,
        profile_id: Optional[str] = None,
    ) -> Optional[TtsModelSettings]:
        with connect(self._db_path) as conn:
            repo = ProfileRepository(conn)
            record = (
                repo.get_tts_model_profile(profile_id)
                if profile_id
                else repo.get_default_tts_model_profile()
            )
        return self._tts_model_settings_from_record(record)

    def load_tts_fallback_model_settings(
        self,
        *,
        profile_ids: list[str],
    ) -> list[TtsModelSettings]:
        loaded: list[TtsModelSettings] = []
        for profile_id in profile_ids:
            settings = self.load_tts_model_settings(profile_id=profile_id)
            if settings is not None:
                loaded.append(settings)
        return loaded

    def list_chat_model_profiles(self):
        with connect(self._db_path) as conn:
            repo = ProfileRepository(conn)
            return repo.list_chat_model_profiles()

    def list_agent_profiles(self):
        with connect(self._db_path) as conn:
            repo = ProfileRepository(conn)
            return repo.list_agent_profiles()

    def create_agent_profile(
        self,
        *,
        name: str,
        description: str,
        opening_message: str,
        idle_timeout_seconds: float,
        max_idle_reminders: int,
        idle_reminder_message: str,
        idle_goodbye_message: str,
        system_prompt: str,
        fallback_prompt: str,
        chat_model_profile_id: Optional[str],
        retrieval_top_k: int,
        knowledge_base_ids: list[str],
        is_default: bool,
    ):
        normalized_kb_ids = self._normalize_knowledge_base_ids(knowledge_base_ids)
        with unit_of_work(self._db_path) as conn:
            repo = ProfileRepository(conn)
            knowledge_repo = KnowledgeBaseRepository(conn)
            self._validate_agent_profile_dependencies(
                profile_repo=repo,
                knowledge_repo=knowledge_repo,
                chat_model_profile_id=chat_model_profile_id,
                knowledge_base_ids=normalized_kb_ids,
                retrieval_top_k=retrieval_top_k,
                idle_timeout_seconds=idle_timeout_seconds,
                max_idle_reminders=max_idle_reminders,
            )
            try:
                return repo.create_agent_profile(
                    name=name,
                    description=description,
                    opening_message=opening_message,
                    idle_timeout_seconds=idle_timeout_seconds,
                    max_idle_reminders=max_idle_reminders,
                    idle_reminder_message=idle_reminder_message,
                    idle_goodbye_message=idle_goodbye_message,
                    system_prompt=system_prompt,
                    fallback_prompt=fallback_prompt,
                    chat_model_profile_id=chat_model_profile_id,
                    retrieval_top_k=retrieval_top_k,
                    knowledge_base_ids=normalized_kb_ids,
                    is_default=is_default,
                )
            except sqlite3.IntegrityError as exc:
                raise ValueError("智能体名称不能重复") from exc

    def update_agent_profile(
        self,
        profile_id: str,
        *,
        name: str,
        description: str,
        opening_message: str,
        idle_timeout_seconds: float,
        max_idle_reminders: int,
        idle_reminder_message: str,
        idle_goodbye_message: str,
        system_prompt: str,
        fallback_prompt: str,
        chat_model_profile_id: Optional[str],
        retrieval_top_k: int,
        knowledge_base_ids: list[str],
        is_default: bool,
    ):
        normalized_kb_ids = self._normalize_knowledge_base_ids(knowledge_base_ids)
        with unit_of_work(self._db_path) as conn:
            repo = ProfileRepository(conn)
            knowledge_repo = KnowledgeBaseRepository(conn)
            self._validate_agent_profile_dependencies(
                profile_repo=repo,
                knowledge_repo=knowledge_repo,
                chat_model_profile_id=chat_model_profile_id,
                knowledge_base_ids=normalized_kb_ids,
                retrieval_top_k=retrieval_top_k,
                idle_timeout_seconds=idle_timeout_seconds,
                max_idle_reminders=max_idle_reminders,
            )
            try:
                return repo.update_agent_profile(
                    profile_id,
                    name=name,
                    description=description,
                    opening_message=opening_message,
                    idle_timeout_seconds=idle_timeout_seconds,
                    max_idle_reminders=max_idle_reminders,
                    idle_reminder_message=idle_reminder_message,
                    idle_goodbye_message=idle_goodbye_message,
                    system_prompt=system_prompt,
                    fallback_prompt=fallback_prompt,
                    chat_model_profile_id=chat_model_profile_id,
                    retrieval_top_k=retrieval_top_k,
                    knowledge_base_ids=normalized_kb_ids,
                    is_default=is_default,
                )
            except sqlite3.IntegrityError as exc:
                raise ValueError("智能体名称不能重复") from exc

    def delete_agent_profile(self, profile_id: str) -> bool:
        with unit_of_work(self._db_path) as conn:
            repo = ProfileRepository(conn)
            return repo.delete_agent_profile(profile_id)

    def create_chat_model_profile(
        self,
        *,
        name: str,
        provider: str,
        model: str,
        base_url: str,
        api_key: str,
        is_default: bool,
    ):
        with unit_of_work(self._db_path) as conn:
            repo = ProfileRepository(conn)
            return repo.create_chat_model_profile(
                name=name,
                provider=provider,
                model=model,
                base_url=base_url,
                api_key=api_key,
                is_default=is_default,
            )

    def update_chat_model_profile(
        self,
        profile_id: str,
        *,
        name: str,
        provider: str,
        model: str,
        base_url: str,
        api_key: str,
        is_default: bool,
    ):
        with unit_of_work(self._db_path) as conn:
            repo = ProfileRepository(conn)
            return repo.update_chat_model_profile(
                profile_id,
                name=name,
                provider=provider,
                model=model,
                base_url=base_url,
                api_key=api_key,
                is_default=is_default,
            )

    def set_default_chat_model_profile(self, profile_id: str):
        with unit_of_work(self._db_path) as conn:
            repo = ProfileRepository(conn)
            return repo.set_default_chat_model_profile(profile_id)

    def delete_chat_model_profile(self, profile_id: str) -> bool:
        with unit_of_work(self._db_path) as conn:
            repo = ProfileRepository(conn)
            return repo.delete_chat_model_profile(profile_id)

    def list_stt_model_profiles(self):
        with connect(self._db_path) as conn:
            repo = ProfileRepository(conn)
            return repo.list_stt_model_profiles()

    def create_stt_model_profile(
        self,
        *,
        name: str,
        provider: str,
        auth_mode: str,
        api_key: str,
        app_id: str,
        access_token: str,
        uid: str,
        resource_id: str,
        cluster: str,
        ws_url: str,
        language: str,
        is_default: bool,
    ):
        with unit_of_work(self._db_path) as conn:
            repo = ProfileRepository(conn)
            return repo.create_stt_model_profile(
                name=name,
                provider=provider,
                auth_mode=auth_mode,
                api_key=api_key,
                app_id=app_id,
                access_token=access_token,
                uid=uid,
                resource_id=resource_id,
                cluster=cluster,
                ws_url=ws_url,
                language=language,
                is_default=is_default,
            )

    def update_stt_model_profile(
        self,
        profile_id: str,
        *,
        name: str,
        provider: str,
        auth_mode: str,
        api_key: str,
        app_id: str,
        access_token: str,
        uid: str,
        resource_id: str,
        cluster: str,
        ws_url: str,
        language: str,
        is_default: bool,
    ):
        with unit_of_work(self._db_path) as conn:
            repo = ProfileRepository(conn)
            return repo.update_stt_model_profile(
                profile_id,
                name=name,
                provider=provider,
                auth_mode=auth_mode,
                api_key=api_key,
                app_id=app_id,
                access_token=access_token,
                uid=uid,
                resource_id=resource_id,
                cluster=cluster,
                ws_url=ws_url,
                language=language,
                is_default=is_default,
            )

    def set_default_stt_model_profile(self, profile_id: str):
        with unit_of_work(self._db_path) as conn:
            repo = ProfileRepository(conn)
            return repo.set_default_stt_model_profile(profile_id)

    def delete_stt_model_profile(self, profile_id: str) -> bool:
        with unit_of_work(self._db_path) as conn:
            repo = ProfileRepository(conn)
            return repo.delete_stt_model_profile(profile_id)

    def list_tts_model_profiles(self):
        with connect(self._db_path) as conn:
            repo = ProfileRepository(conn)
            return repo.list_tts_model_profiles()

    def create_tts_model_profile(
        self,
        *,
        name: str,
        provider: str,
        auth_mode: str,
        api_key: str,
        app_id: str,
        access_token: str,
        uid: str,
        resource_id: str,
        cluster: str,
        http_url: str,
        voice_type: str,
        encoding: str,
        sample_rate: int,
        speed_ratio: float,
        volume_ratio: float,
        pitch_ratio: float,
        is_default: bool,
    ):
        with unit_of_work(self._db_path) as conn:
            repo = ProfileRepository(conn)
            return repo.create_tts_model_profile(
                name=name,
                provider=provider,
                auth_mode=auth_mode,
                api_key=api_key,
                app_id=app_id,
                access_token=access_token,
                uid=uid,
                resource_id=resource_id,
                cluster=cluster,
                http_url=http_url,
                voice_type=voice_type,
                encoding=encoding,
                sample_rate=sample_rate,
                speed_ratio=speed_ratio,
                volume_ratio=volume_ratio,
                pitch_ratio=pitch_ratio,
                is_default=is_default,
            )

    def update_tts_model_profile(
        self,
        profile_id: str,
        *,
        name: str,
        provider: str,
        auth_mode: str,
        api_key: str,
        app_id: str,
        access_token: str,
        uid: str,
        resource_id: str,
        cluster: str,
        http_url: str,
        voice_type: str,
        encoding: str,
        sample_rate: int,
        speed_ratio: float,
        volume_ratio: float,
        pitch_ratio: float,
        is_default: bool,
    ):
        with unit_of_work(self._db_path) as conn:
            repo = ProfileRepository(conn)
            return repo.update_tts_model_profile(
                profile_id,
                name=name,
                provider=provider,
                auth_mode=auth_mode,
                api_key=api_key,
                app_id=app_id,
                access_token=access_token,
                uid=uid,
                resource_id=resource_id,
                cluster=cluster,
                http_url=http_url,
                voice_type=voice_type,
                encoding=encoding,
                sample_rate=sample_rate,
                speed_ratio=speed_ratio,
                volume_ratio=volume_ratio,
                pitch_ratio=pitch_ratio,
                is_default=is_default,
            )

    def set_default_tts_model_profile(self, profile_id: str):
        with unit_of_work(self._db_path) as conn:
            repo = ProfileRepository(conn)
            return repo.set_default_tts_model_profile(profile_id)

    def delete_tts_model_profile(self, profile_id: str) -> bool:
        with unit_of_work(self._db_path) as conn:
            repo = ProfileRepository(conn)
            return repo.delete_tts_model_profile(profile_id)

    def list_embedding_profiles(self):
        with connect(self._db_path) as conn:
            repo = ProfileRepository(conn)
            return repo.list_embedding_profiles()

    def create_embedding_profile(
        self,
        *,
        name: str,
        provider: str,
        model: str,
        base_url: str,
        api_key_env: str,
    ):
        with unit_of_work(self._db_path) as conn:
            repo = ProfileRepository(conn)
            return repo.create_embedding_profile(
                name=name,
                provider=provider,
                model=model,
                base_url=base_url,
                api_key_env=api_key_env,
            )

    def update_embedding_profile(
        self,
        profile_id: str,
        *,
        name: str,
        provider: str,
        model: str,
        base_url: str,
        api_key_env: str,
    ):
        with unit_of_work(self._db_path) as conn:
            repo = ProfileRepository(conn)
            return repo.update_embedding_profile(
                profile_id,
                name=name,
                provider=provider,
                model=model,
                base_url=base_url,
                api_key_env=api_key_env,
            )

    def delete_embedding_profile(self, profile_id: str) -> tuple[bool, bool]:
        with unit_of_work(self._db_path) as conn:
            repo = ProfileRepository(conn)
            knowledge_repo = KnowledgeBaseRepository(conn)
            if knowledge_repo.count_knowledge_bases_using_embedding_profile(profile_id) > 0:
                return False, True
            return repo.delete_embedding_profile(profile_id), False

    @staticmethod
    def _normalize_knowledge_base_ids(knowledge_base_ids: list[str]) -> list[str]:
        deduped: list[str] = []
        seen: set[str] = set()
        for kb_id in knowledge_base_ids:
            value = kb_id.strip()
            if not value or value in seen:
                continue
            deduped.append(value)
            seen.add(value)
        return deduped

    @staticmethod
    def _validate_agent_profile_dependencies(
        *,
        profile_repo: ProfileRepository,
        knowledge_repo: KnowledgeBaseRepository,
        chat_model_profile_id: Optional[str],
        knowledge_base_ids: list[str],
        retrieval_top_k: int,
        idle_timeout_seconds: float,
        max_idle_reminders: int,
    ) -> None:
        if retrieval_top_k <= 0:
            raise ValueError("向量召回数量必须大于 0")
        if idle_timeout_seconds < 0:
            raise ValueError("无人应答超时时间不能小于 0")
        if max_idle_reminders < 0:
            raise ValueError("无人应答提醒次数不能小于 0")
        if (
            chat_model_profile_id
            and profile_repo.get_chat_model_profile(chat_model_profile_id) is None
        ):
            raise ValueError("智能体绑定的对话模型不存在")
        missing_kb_ids = [
            kb_id for kb_id in knowledge_base_ids if knowledge_repo.get_knowledge_base(kb_id) is None
        ]
        if missing_kb_ids:
            raise ValueError("智能体绑定的知识库不存在")

    @staticmethod
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

    @staticmethod
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

    @staticmethod
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
