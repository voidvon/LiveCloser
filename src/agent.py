from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Optional

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    ChatContext,
    ChatMessage,
    JobContext,
    JobProcess,
    RunContext,
    cli,
    function_tool,
    room_io,
)
from livekit.plugins import openai, silero

from livekit_sales_agent.conversation import ConversationService
from livekit_sales_agent.config import (
    AgentProfileSettings,
    Settings,
    load_agent_profile_settings,
    load_stt_model_settings,
    load_tts_model_settings,
)
from livekit_sales_agent.knowledge.db import ensure_database
from livekit_sales_agent.knowledge.retrieval import RetrievalService
from livekit_sales_agent.prompts import build_instructions
from livekit_sales_agent.voice import build_stt, build_tts


load_dotenv()

settings = Settings.from_env()
ensure_database(settings.kb_data_dir / "app.db")
retrieval_service = RetrievalService(
    db_path=settings.kb_data_dir / "app.db",
    chroma_root=settings.kb_data_dir / "chroma",
)
conversation_service = ConversationService(db_path=settings.kb_data_dir / "app.db")
server = AgentServer()
logger = logging.getLogger("livekit_sales_agent.agent")


@dataclass
class SessionMetadata:
    session_mode: str = "voice"
    knowledge_base_id: Optional[str] = None
    agent_profile_id: Optional[str] = None
    conversation_id: Optional[str] = None

    @property
    def is_text_mode(self) -> bool:
        return self.session_mode == "text"


def prewarm(proc: JobProcess) -> None:
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


class SalesAgent(Agent):
    def __init__(
        self,
        config: Settings,
        metadata: SessionMetadata,
        agent_profile: AgentProfileSettings,
        *,
        has_tts: bool,
    ):
        self._config = config
        self._metadata = metadata
        self._agent_profile = agent_profile
        self._has_tts = has_tts
        super().__init__(
            instructions=build_instructions(
                config,
                system_prompt=agent_profile.system_prompt,
                fallback_prompt=agent_profile.fallback_prompt,
                retrieval_top_k=agent_profile.retrieval_top_k,
            )
        )

    async def on_enter(self) -> None:
        if self._metadata.is_text_mode or not self._has_tts:
            return

        self.session.say(
            "你好，我是你的 AI 销售助理。我可以介绍产品、套餐、标准价格和购买流程。你可以直接问我具体需求。",
            add_to_chat_ctx=True,
        )

    async def on_user_turn_completed(
        self,
        turn_ctx: ChatContext,
        new_message: ChatMessage,
    ) -> None:
        self._inject_retrieval_context(turn_ctx, query=(new_message.text_content or "").strip())

    @function_tool()
    async def search_knowledge_base(
        self,
        context: RunContext,
        query: str,
    ) -> str:
        """Search the configured knowledge base for product, pricing, FAQ, and sales information.

        Args:
            query: The user's question rewritten as a concise retrieval query.
        """
        del context
        return self._search_knowledge_base(query)

    def _resolve_search_kb_ids(self) -> list[str]:
        selected_kb_id = self._metadata.knowledge_base_id
        allowed_kb_ids = self._agent_profile.knowledge_base_ids
        if selected_kb_id:
            if not allowed_kb_ids or selected_kb_id in allowed_kb_ids:
                return [selected_kb_id]
            return allowed_kb_ids
        return allowed_kb_ids

    def _search_knowledge_base(self, query: str) -> str:
        kb_ids = self._resolve_search_kb_ids()
        if not kb_ids:
            return "当前会话没有绑定知识库。"

        try:
            if len(kb_ids) == 1:
                results = retrieval_service.search(
                    kb_id=kb_ids[0],
                    query=query,
                    top_k=self._agent_profile.retrieval_top_k,
                )
            else:
                results = retrieval_service.search_many(
                    kb_ids=kb_ids,
                    query=query,
                    top_k=self._agent_profile.retrieval_top_k,
                )
        except Exception as exc:
            return f"知识库检索失败：{exc}"

        if not results:
            return "没有检索到相关知识。"

        return self._format_search_results(results)

    def _build_rag_context(self, *, query: str, results: list[dict[str, object]]) -> str:
        return (
            "以下是系统基于当前用户问题自动检索到的知识库片段。"
            "请优先依据这些片段作答，不要脱离片段编造事实。"
            "如果片段仍不足以支持结论，就明确说明知识库信息不足。\n\n"
            f"用户问题：{query}\n\n"
            f"{self._format_search_results(results)}"
        )

    def build_turn_chat_context(self, query: str) -> ChatContext:
        turn_ctx = self.chat_ctx.copy()
        self._inject_retrieval_context(turn_ctx, query=query)
        return turn_ctx

    def _inject_retrieval_context(self, turn_ctx: ChatContext, *, query: str) -> None:
        kb_ids = self._resolve_search_kb_ids()
        query = query.strip()
        if not kb_ids or not query:
            return

        try:
            if len(kb_ids) == 1:
                results = retrieval_service.search(
                    kb_id=kb_ids[0],
                    query=query,
                    top_k=self._agent_profile.retrieval_top_k,
                )
            else:
                results = retrieval_service.search_many(
                    kb_ids=kb_ids,
                    query=query,
                    top_k=self._agent_profile.retrieval_top_k,
                )
        except Exception as exc:
            logger.exception(
                "knowledge retrieval failed",
                extra={"kb_ids": kb_ids, "query": query},
            )
            turn_ctx.add_message(
                role="system",
                content=(
                    "当前会话已绑定知识库，但本回合检索失败。"
                    f"错误：{exc}。"
                    f"请严格遵循以下兜底提示：{self._agent_profile.fallback_prompt or '不要编造知识库内容，直接说明当前无法从知识库读取到相关资料。'}"
                ),
            )
            return

        logger.info(
            "knowledge retrieval completed",
            extra={
                "kb_ids": kb_ids,
                "query": query,
                "result_count": len(results),
            },
        )

        if not results:
            turn_ctx.add_message(
                role="system",
                content=(
                    "当前会话已绑定知识库，但本回合没有检索到相关片段。"
                    f"请严格遵循以下兜底提示：{self._agent_profile.fallback_prompt or '不要猜测答案，直接说明当前知识库没有足够信息。'}"
                ),
            )
            return

        turn_ctx.add_message(
            role="system",
            content=self._build_rag_context(query=query, results=results),
        )

    def _format_search_results(self, results: list[dict[str, object]]) -> str:
        parts: list[str] = []
        for index, result in enumerate(results, start=1):
            metadata = result.get("metadata") or {}
            title = str(metadata.get("title") or "片段")
            source = str(metadata.get("source_path") or "")
            category = str(metadata.get("category_name") or metadata.get("category") or "")
            content = str(result.get("content", "")).strip()
            distance = result.get("distance")

            lines = [f"[{index}] {title}"]
            if source:
                lines.append(f"来源：{source}")
            if category:
                lines.append(f"分类：{category}")
            if distance is not None:
                lines.append(f"相似度距离：{distance}")
            lines.append(content)
            parts.append("\n".join(lines))
        return "\n\n".join(parts)

    async def restore_history(self) -> None:
        conversation_id = self._metadata.conversation_id
        if not conversation_id:
            return

        history = conversation_service.build_chat_context(conversation_id)
        if not history.items:
            return

        await self.update_chat_ctx(history)


def build_session(
    proc: JobProcess,
    metadata: SessionMetadata,
    agent_profile: AgentProfileSettings,
) -> tuple[AgentSession, bool, bool]:
    settings.validate()
    db_path = settings.kb_data_dir / "app.db"
    stt_profile = None if metadata.is_text_mode else load_stt_model_settings(db_path)
    tts_profile = None if metadata.is_text_mode else load_tts_model_settings(db_path)
    stt_impl = build_stt(stt_profile)
    tts_impl = build_tts(tts_profile)
    llm_kwargs: dict[str, Any] = {
        "model": agent_profile.chat_model.model,
        "base_url": agent_profile.chat_model.base_url,
        "api_key": agent_profile.chat_model.api_key,
    }
    if agent_profile.chat_model.is_deepseek_v4:
        # DeepSeek V4 defaults to thinking mode. Its OpenAI compatibility flow expects
        # reasoning_content to be echoed back on the next turn, which the LiveKit OpenAI
        # adapter does not preserve. Disable thinking for stable multi-turn chat.
        llm_kwargs["extra_body"] = {"thinking": {"type": "disabled"}}
    session_kwargs: dict[str, Any] = {
        "vad": proc.userdata["vad"],
        "llm": openai.LLM(**llm_kwargs),
        "turn_handling": {"turn_detection": "vad"},
    }
    if stt_impl is not None:
        session_kwargs["stt"] = stt_impl
    if tts_impl is not None:
        session_kwargs["tts"] = tts_impl
    return AgentSession(**session_kwargs), stt_impl is not None, tts_impl is not None


async def handle_text_input(
    session: AgentSession,
    event: room_io.TextInputEvent,
    agent: SalesAgent,
) -> None:
    query = event.text.strip()
    if not query:
        return

    logger.info(
        "handling text input",
        extra={
            "session_mode": agent._metadata.session_mode,
            "knowledge_base_id": agent._metadata.knowledge_base_id,
            "query": query,
        },
    )

    await session.interrupt()
    turn_ctx = agent.build_turn_chat_context(query)
    session.generate_reply(
        user_input=query,
        chat_ctx=turn_ctx,
        input_modality="text",
    )


def parse_session_metadata(ctx: JobContext) -> SessionMetadata:
    metadata_text = _extract_agent_metadata(ctx)
    if not metadata_text:
        return SessionMetadata()
    try:
        payload = json.loads(metadata_text)
    except json.JSONDecodeError:
        return SessionMetadata()
    return SessionMetadata(
        session_mode=str(payload.get("session_mode") or "voice"),
        knowledge_base_id=_optional_str(payload.get("knowledge_base_id")),
        agent_profile_id=_optional_str(payload.get("agent_profile_id")),
        conversation_id=_optional_str(payload.get("conversation_id")),
    )


def _extract_agent_metadata(ctx: JobContext) -> Optional[str]:
    candidates = []

    job = getattr(ctx, "job", None)
    if job is not None:
        candidates.append(getattr(job, "metadata", None))

    info = getattr(ctx, "_info", None)
    if info is not None:
        accept_arguments = getattr(info, "accept_arguments", None)
        if accept_arguments is not None:
            candidates.append(getattr(accept_arguments, "metadata", None))

    candidates.extend(
        [
            getattr(ctx, "dispatch_metadata", None),
            getattr(ctx, "metadata", None),
        ]
    )

    for value in candidates:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _optional_str(value: object) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


@server.rtc_session(agent_name=settings.agent_name)
async def entrypoint(ctx: JobContext) -> None:
    raw_metadata = _extract_agent_metadata(ctx)
    metadata = parse_session_metadata(ctx)
    resolved_agent_profile = load_agent_profile_settings(
        settings.kb_data_dir / "app.db",
        agent_profile_id=metadata.agent_profile_id,
        default_retrieval_top_k=settings.kb_top_k,
    )
    metadata.agent_profile_id = resolved_agent_profile.profile_id
    ensured_conversation = conversation_service.ensure_conversation(
        metadata.conversation_id,
        knowledge_base_id=metadata.knowledge_base_id,
        agent_profile_id=metadata.agent_profile_id,
        last_mode=metadata.session_mode,
    )
    metadata.conversation_id = ensured_conversation.id
    job_metadata = getattr(getattr(ctx, "job", None), "metadata", None)
    logger.info(
        "starting agent session",
        extra={
            "session_mode": metadata.session_mode,
            "knowledge_base_id": metadata.knowledge_base_id,
            "agent_profile_id": metadata.agent_profile_id,
            "conversation_id": metadata.conversation_id,
            "raw_metadata": raw_metadata,
            "job_metadata": job_metadata,
        },
    )
    session, has_stt, has_tts = build_session(ctx.proc, metadata, resolved_agent_profile)
    agent = SalesAgent(settings, metadata, resolved_agent_profile, has_tts=has_tts)
    await agent.restore_history()

    @session.on("conversation_item_added")
    def _handle_conversation_item_added(event) -> None:
        item = getattr(event, "item", None)
        if not isinstance(item, ChatMessage):
            return
        if item.role not in {"user", "assistant"}:
            return
        content = (item.text_content or "").strip()
        if not content:
            return
        if not metadata.conversation_id:
            return
        conversation_service.append_message(
            conversation_id=metadata.conversation_id,
            role=item.role,
            content=content,
            source_mode=metadata.session_mode,
            external_message_id=item.id,
        )

    room_options = room_io.RoomOptions(
        text_input=room_io.TextInputOptions(
            text_input_cb=lambda sess, ev: handle_text_input(sess, ev, agent)
        ),
        audio_input=False if metadata.is_text_mode or not has_stt else room_io.AudioInputOptions(),
        audio_output=False if metadata.is_text_mode or not has_tts else True,
        text_output=room_io.TextOutputOptions(
            sync_transcription=False,
        ),
    )
    await session.start(
        room=ctx.room,
        agent=agent,
        room_options=room_options,
    )


if __name__ == "__main__":
    cli.run_app(server)
