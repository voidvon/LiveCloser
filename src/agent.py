from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Optional

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    RunContext,
    cli,
    function_tool,
    room_io,
)
from livekit.plugins import openai, silero

from livekit_sales_agent.config import Settings
from livekit_sales_agent.knowledge import RetrievalService
from livekit_sales_agent.prompts import build_instructions
from livekit_sales_agent.voice import build_stt, build_tts


load_dotenv()

settings = Settings.from_env()
retrieval_service = RetrievalService(
    db_path=settings.kb_data_dir / "app.db",
    chroma_root=settings.kb_data_dir / "chroma",
)
server = AgentServer()


@dataclass
class SessionMetadata:
    session_mode: str = "voice"
    knowledge_base_id: Optional[str] = None

    @property
    def is_text_mode(self) -> bool:
        return self.session_mode == "text"


def prewarm(proc: JobProcess) -> None:
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


class SalesAgent(Agent):
    def __init__(self, config: Settings, metadata: SessionMetadata):
        self._config = config
        self._metadata = metadata
        super().__init__(instructions=build_instructions(config))

    async def on_enter(self) -> None:
        if self._metadata.is_text_mode or not self._config.tts_descriptor:
            return

        self.session.say(
            "你好，我是你的 AI 销售助理。我可以介绍产品、套餐、标准价格和购买流程。你可以直接问我具体需求。",
            add_to_chat_ctx=True,
        )

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
        kb_id = self._metadata.knowledge_base_id
        if not kb_id:
            return "当前会话没有绑定知识库。"

        try:
            results = retrieval_service.search(kb_id=kb_id, query=query)
        except Exception as exc:
            return f"知识库检索失败：{exc}"

        if not results:
            return "没有检索到相关知识。"

        parts: list[str] = []
        for index, result in enumerate(results, start=1):
            metadata = result.get("metadata") or {}
            title = metadata.get("title", "片段")
            source = metadata.get("source_path", "")
            content = str(result.get("content", "")).strip()
            parts.append(f"[{index}] {title}\n来源：{source}\n{content}")
        return "\n\n".join(parts)


def build_session(proc: JobProcess, metadata: SessionMetadata) -> AgentSession:
    settings.validate()
    stt_impl = None if metadata.is_text_mode else build_stt(settings)
    tts_impl = None if metadata.is_text_mode else build_tts(settings)
    session_kwargs: dict[str, Any] = {
        "vad": proc.userdata["vad"],
        "llm": openai.LLM(
            model=settings.llm_model,
            base_url=settings.llm_base_url,
            api_key=settings.llm_api_key,
        ),
        "turn_handling": {"turn_detection": "vad"},
    }
    if stt_impl is not None:
        session_kwargs["stt"] = stt_impl
    if tts_impl is not None:
        session_kwargs["tts"] = tts_impl
    return AgentSession(**session_kwargs)


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
    )


def _extract_agent_metadata(ctx: JobContext) -> Optional[str]:
    candidates = []

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
    metadata = parse_session_metadata(ctx)
    session = build_session(ctx.proc, metadata)
    agent = SalesAgent(settings, metadata)
    room_options = room_io.RoomOptions(
        audio_input=False
        if metadata.is_text_mode or not settings.stt_descriptor
        else room_io.AudioInputOptions(),
        audio_output=False if metadata.is_text_mode or not settings.tts_descriptor else True,
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
