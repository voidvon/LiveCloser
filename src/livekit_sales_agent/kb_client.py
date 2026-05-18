from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import httpx

from livekit_sales_agent.config import (
    AgentProfileSettings,
    ChatModelSettings,
    SttModelSettings,
    TtsModelSettings,
)


def _build_chat_model_settings(payload: dict[str, Any]) -> ChatModelSettings:
    return ChatModelSettings(
        model=str(payload.get("model") or ""),
        base_url=str(payload.get("base_url") or ""),
        api_key=str(payload.get("api_key") or ""),
    )


def _build_stt_model_settings(payload: Optional[dict[str, Any]]) -> Optional[SttModelSettings]:
    if payload is None:
        return None
    return SttModelSettings(
        provider=str(payload.get("provider") or ""),
        auth_mode=str(payload.get("auth_mode") or ""),
        api_key=str(payload.get("api_key") or ""),
        app_id=str(payload.get("app_id") or ""),
        access_token=str(payload.get("access_token") or ""),
        uid=str(payload.get("uid") or ""),
        resource_id=str(payload.get("resource_id") or ""),
        cluster=str(payload.get("cluster") or ""),
        ws_url=str(payload.get("ws_url") or ""),
        language=str(payload.get("language") or ""),
    )


def _build_tts_model_settings(payload: Optional[dict[str, Any]]) -> Optional[TtsModelSettings]:
    if payload is None:
        return None
    return TtsModelSettings(
        provider=str(payload.get("provider") or ""),
        auth_mode=str(payload.get("auth_mode") or ""),
        api_key=str(payload.get("api_key") or ""),
        app_id=str(payload.get("app_id") or ""),
        access_token=str(payload.get("access_token") or ""),
        uid=str(payload.get("uid") or ""),
        resource_id=str(payload.get("resource_id") or ""),
        cluster=str(payload.get("cluster") or ""),
        http_url=str(payload.get("http_url") or ""),
        voice_type=str(payload.get("voice_type") or ""),
        encoding=str(payload.get("encoding") or ""),
        sample_rate=int(payload.get("sample_rate") or 0),
        speed_ratio=float(payload.get("speed_ratio") or 0),
        volume_ratio=float(payload.get("volume_ratio") or 0),
        pitch_ratio=float(payload.get("pitch_ratio") or 0),
    )


def _build_agent_profile_settings(payload: dict[str, Any]) -> AgentProfileSettings:
    return AgentProfileSettings(
        profile_id=payload.get("profile_id"),
        name=str(payload.get("name") or ""),
        description=str(payload.get("description") or ""),
        opening_message=str(payload.get("opening_message") or ""),
        idle_timeout_seconds=float(payload.get("idle_timeout_seconds") or 0),
        max_idle_reminders=int(payload.get("max_idle_reminders") or 0),
        idle_reminder_message=str(payload.get("idle_reminder_message") or ""),
        idle_goodbye_message=str(payload.get("idle_goodbye_message") or ""),
        system_prompt=str(payload.get("system_prompt") or ""),
        fallback_prompt=str(payload.get("fallback_prompt") or ""),
        retrieval_top_k=int(payload.get("retrieval_top_k") or 0),
        knowledge_base_ids=[
            str(item).strip()
            for item in payload.get("knowledge_base_ids") or []
            if str(item).strip()
        ],
        chat_model=_build_chat_model_settings(dict(payload.get("chat_model") or {})),
    )


@dataclass(slots=True)
class KBClient:
    base_url: str
    timeout: float = 20.0

    async def _request_json(
        self,
        method: str,
        path: str,
        *,
        params: Optional[dict[str, Any]] = None,
        json_body: Optional[dict[str, Any]] = None,
    ) -> Any:
        async with httpx.AsyncClient(
            base_url=self.base_url.rstrip("/"),
            timeout=self.timeout,
        ) as client:
            response = await client.request(
                method,
                path,
                params=params,
                json=json_body,
            )
        response.raise_for_status()
        if not response.content:
            return None
        return response.json()

    async def search_products(
        self,
        *,
        query: str = "",
        category: str = "",
        brand: str = "",
        model: str = "",
        sku: str = "",
        status: str = "",
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        search_query = query.strip() or model.strip() or sku.strip()
        payload = await self._request_json(
            "GET",
            "/products",
            params={
                "query": search_query,
                "category": category,
                "brand": brand,
                "status": status,
                "limit": limit,
            },
        )
        return list(payload or [])

    async def get_product_catalog(self, product_id: str) -> Optional[dict[str, Any]]:
        payload = await self._request_json("GET", f"/products/{product_id}/catalog-view")
        return dict(payload or {}) if payload else None

    async def resolve_product_price(
        self,
        product_id: str,
        *,
        price_book_code: str = "standard",
        quantity: int = 1,
        effective_at: Optional[str] = None,
        specs: Optional[dict[str, str]] = None,
    ) -> Optional[dict[str, Any]]:
        payload = await self._request_json(
            "POST",
            f"/products/{product_id}/resolve-price",
            json_body={
                "price_book_code": price_book_code,
                "quantity": quantity,
                "effective_at": effective_at,
                "specs": specs or {},
            },
        )
        return dict(payload or {}) if payload else None

    async def search_knowledge_base(
        self,
        *,
        query: str,
        knowledge_base_ids: list[str],
        top_k: int,
    ) -> list[dict[str, Any]]:
        payload = await self._request_json(
            "POST",
            "/retrieval/search",
            json_body={
                "query": query,
                "knowledge_base_ids": knowledge_base_ids,
                "top_k": top_k,
            },
        )
        return list(payload or [])

    async def load_agent_profile_settings(
        self,
        *,
        agent_profile_id: Optional[str],
        default_retrieval_top_k: int,
    ) -> AgentProfileSettings:
        payload = await self._request_json(
            "GET",
            "/agent-runtime/profile",
            params={
                "agent_profile_id": agent_profile_id,
                "default_retrieval_top_k": default_retrieval_top_k,
            },
        )
        return _build_agent_profile_settings(dict(payload or {}))

    async def load_stt_model_settings(
        self,
        *,
        profile_id: Optional[str] = None,
    ) -> Optional[SttModelSettings]:
        payload = await self._request_json(
            "GET",
            "/agent-runtime/stt-model",
            params={"profile_id": profile_id},
        )
        return _build_stt_model_settings(payload)

    async def load_stt_fallback_model_settings(
        self,
        *,
        profile_ids: list[str],
    ) -> list[SttModelSettings]:
        payload = await self._request_json(
            "POST",
            "/agent-runtime/stt-fallback-models",
            json_body={"profile_ids": profile_ids},
        )
        return [
            model
            for item in payload or []
            if (model := _build_stt_model_settings(dict(item))) is not None
        ]

    async def load_tts_model_settings(
        self,
        *,
        profile_id: Optional[str] = None,
    ) -> Optional[TtsModelSettings]:
        payload = await self._request_json(
            "GET",
            "/agent-runtime/tts-model",
            params={"profile_id": profile_id},
        )
        return _build_tts_model_settings(payload)

    async def load_tts_fallback_model_settings(
        self,
        *,
        profile_ids: list[str],
    ) -> list[TtsModelSettings]:
        payload = await self._request_json(
            "POST",
            "/agent-runtime/tts-fallback-models",
            json_body={"profile_ids": profile_ids},
        )
        return [
            model
            for item in payload or []
            if (model := _build_tts_model_settings(dict(item))) is not None
        ]

    async def ensure_conversation(
        self,
        conversation_id: Optional[str],
        *,
        knowledge_base_id: Optional[str],
        agent_profile_id: Optional[str],
        last_mode: str,
    ) -> dict[str, Any]:
        payload = await self._request_json(
            "POST",
            "/chat/conversations/ensure",
            json_body={
                "conversation_id": conversation_id,
                "knowledge_base_id": knowledge_base_id,
                "agent_profile_id": agent_profile_id,
                "last_mode": last_mode,
            },
        )
        return dict(payload or {})

    async def list_conversation_messages(
        self,
        conversation_id: str,
    ) -> list[dict[str, Any]]:
        payload = await self._request_json(
            "GET",
            f"/chat/conversations/{conversation_id}/messages",
        )
        return list(payload or [])

    async def append_message(
        self,
        conversation_id: str,
        *,
        role: str,
        content: str,
        source_mode: str,
        external_message_id: Optional[str] = None,
    ) -> dict[str, Any]:
        payload = await self._request_json(
            "POST",
            f"/chat/conversations/{conversation_id}/messages",
            json_body={
                "role": role,
                "content": content,
                "source_mode": source_mode,
                "external_message_id": external_message_id,
            },
        )
        return dict(payload or {})

    async def end_conversation(
        self,
        conversation_id: str,
        *,
        reason: str,
        detail: str = "",
    ) -> dict[str, Any]:
        payload = await self._request_json(
            "POST",
            f"/chat/conversations/{conversation_id}/end",
            json_body={"reason": reason, "detail": detail},
        )
        return dict(payload or {})
