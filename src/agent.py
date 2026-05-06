from __future__ import annotations

from dotenv import load_dotenv
from livekit.agents import Agent, AgentServer, AgentSession, JobContext, JobProcess, RunContext, cli, function_tool, room_io
from livekit.plugins import openai, silero

from livekit_sales_agent.config import Settings
from livekit_sales_agent.kb import KnowledgeBase
from livekit_sales_agent.prompts import build_instructions


load_dotenv()

settings = Settings.from_env()
knowledge_base = KnowledgeBase.from_directory(
    settings.kb_dir, stale_after_days=settings.price_stale_after_days
)
server = AgentServer()


def prewarm(proc: JobProcess) -> None:
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


class SalesAgent(Agent):
    def __init__(self, config: Settings, kb: KnowledgeBase):
        self._config = config
        self._kb = kb
        super().__init__(instructions=build_instructions(config))

    async def on_enter(self) -> None:
        # In text-only mode, avoid calling say() because it requires TTS.
        if not self._config.tts_descriptor:
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
        """Search the local knowledge base for product, pricing, FAQ, and sales information.

        Args:
            query: The user's question rewritten as a concise retrieval query.
        """
        del context
        return self._kb.render_context(query=query, limit=self._config.kb_top_k)


def build_session(proc: JobProcess) -> AgentSession:
    settings.validate()
    session_kwargs = dict(
        vad=proc.userdata["vad"],
        llm=openai.LLM(
            model=settings.llm_model,
            base_url=settings.llm_base_url,
            api_key=settings.llm_api_key,
        ),
        turn_handling={"turn_detection": "vad"},
    )
    if settings.stt_descriptor:
        session_kwargs["stt"] = settings.stt_descriptor
    if settings.tts_descriptor:
        session_kwargs["tts"] = settings.tts_descriptor
    return AgentSession(**session_kwargs)


@server.rtc_session(agent_name=settings.agent_name)
async def entrypoint(ctx: JobContext) -> None:
    session = build_session(ctx.proc)
    agent = SalesAgent(settings, knowledge_base)
    room_options = room_io.RoomOptions(
        audio_input=False if not settings.stt_descriptor else room_io.AudioInputOptions(),
        audio_output=False if not settings.tts_descriptor else True,
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
