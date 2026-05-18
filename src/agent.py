from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Any, Awaitable, Literal, Optional

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

from livekit_sales_agent.config import (
    AgentProfileSettings,
    Settings,
)
from livekit_sales_agent.kb_client import KBClient
from livekit_sales_agent.prompts import build_instructions
from livekit_sales_agent.voice import build_stt, build_tts


load_dotenv()

settings = Settings.from_env()
kb_client = KBClient(base_url=settings.kb_api_url)
server = AgentServer()
logger = logging.getLogger("livekit_sales_agent.agent")


def _schedule_background_task(
    operation: Awaitable[object],
    *,
    task_name: str,
    conversation_id: Optional[str],
) -> None:
    task = asyncio.create_task(operation, name=task_name)

    def _log_result(completed: asyncio.Task[object]) -> None:
        try:
            completed.result()
        except asyncio.CancelledError:
            return
        except Exception:
            logger.exception(
                "background kb request failed",
                extra={
                    "conversation_id": conversation_id,
                    "task_name": task_name,
                },
            )

    task.add_done_callback(_log_result)


@dataclass
class SessionMetadata:
    session_mode: str = "voice"
    agent_profile_id: Optional[str] = None
    conversation_id: Optional[str] = None

    @property
    def is_text_mode(self) -> bool:
        return self.session_mode == "text"


class IdleCallController:
    def __init__(
        self,
        session: AgentSession,
        metadata: SessionMetadata,
        agent_profile: AgentProfileSettings,
    ) -> None:
        self._session = session
        self._metadata = metadata
        self._agent_profile = agent_profile
        self._away_count = 0
        self._user_state: Literal["speaking", "listening", "away"] = "listening"
        self._agent_state: str = "initializing"
        self._idle_timer_task: asyncio.Task[None] | None = None
        self._pending_task: asyncio.Task[None] | None = None
        self.closed_by_idle = False

    @property
    def enabled(self) -> bool:
        return (
            not self._metadata.is_text_mode
            and self._agent_profile.idle_timeout_seconds > 0
        )

    def on_user_speaking(
        self,
        *,
        reset_away_count: bool = False,
        update_state: bool = True,
    ) -> None:
        if not self.enabled:
            return
        if update_state:
            self._user_state = "speaking"
        if reset_away_count:
            self._away_count = 0
        self._cancel_idle_timer()
        self._cancel_pending_task()
        if self.closed_by_idle:
            logger.info(
                "user resumed speaking while idle close was pending",
                extra={"conversation_id": self._metadata.conversation_id},
            )
            self.closed_by_idle = False

    def on_user_listening(self) -> None:
        if not self.enabled:
            return
        self._user_state = "listening"
        self._arm_idle_timer_if_needed()

    def on_agent_state_changed(self, state_name: str) -> None:
        if not self.enabled:
            return
        self._agent_state = state_name
        if self._is_waiting_for_user_response():
            self._arm_idle_timer_if_needed()
            return
        self._cancel_idle_timer()

    def cancel(self) -> None:
        self._cancel_idle_timer()
        self._cancel_pending_task()

    def _is_waiting_for_user_response(self) -> bool:
        return self._user_state == "listening" and self._agent_state in {"listening", "idle"}

    def _arm_idle_timer_if_needed(self) -> None:
        if not self._is_waiting_for_user_response():
            return
        if self._pending_task is not None and not self._pending_task.done():
            return
        if self._idle_timer_task is not None and not self._idle_timer_task.done():
            return
        self._idle_timer_task = asyncio.create_task(
            self._wait_for_idle_timeout(),
            name=f"idle-window-{self._metadata.conversation_id or 'session'}",
        )

    def _cancel_idle_timer(self) -> None:
        if self._idle_timer_task is None or self._idle_timer_task.done():
            return
        task = self._idle_timer_task
        task.cancel()
        if self._idle_timer_task is task:
            self._idle_timer_task = None

    async def _wait_for_idle_timeout(self) -> None:
        try:
            logger.info(
                "waiting for user idle timeout window",
                extra={
                    "conversation_id": self._metadata.conversation_id,
                    "idle_timeout_seconds": self._agent_profile.idle_timeout_seconds,
                    "away_count": self._away_count,
                },
            )
            await asyncio.sleep(self._agent_profile.idle_timeout_seconds)
            if not self._is_waiting_for_user_response():
                return

            self._away_count += 1
            is_final_attempt = self._away_count > self._agent_profile.max_idle_reminders
            logger.info(
                "user idle timeout elapsed",
                extra={
                    "conversation_id": self._metadata.conversation_id,
                    "session_mode": self._metadata.session_mode,
                    "away_count": self._away_count,
                    "max_idle_reminders": self._agent_profile.max_idle_reminders,
                    "is_final_attempt": is_final_attempt,
                },
            )
            task_name = "idle-close" if is_final_attempt else "idle-reminder"
            self._pending_task = asyncio.create_task(
                self._handle_idle_transition(is_final_attempt=is_final_attempt),
                name=f"{task_name}-{self._metadata.conversation_id or 'session'}",
            )
        finally:
            current_task = asyncio.current_task()
            if self._idle_timer_task is current_task:
                self._idle_timer_task = None

    def _cancel_pending_task(self) -> None:
        if self._pending_task is None or self._pending_task.done():
            return
        task = self._pending_task
        task.cancel()
        if self._pending_task is task:
            self._pending_task = None

    async def _handle_idle_transition(self, *, is_final_attempt: bool) -> None:
        should_rearm_idle_timer = False
        try:
            if is_final_attempt:
                self.closed_by_idle = True
                message = self._agent_profile.idle_goodbye_message.strip()
            else:
                message = self._agent_profile.idle_reminder_message.strip()

            if message:
                await self._say_and_wait(message)

            if is_final_attempt:
                logger.info(
                    "closing session after repeated idle timeouts",
                    extra={
                        "conversation_id": self._metadata.conversation_id,
                        "idle_timeout_seconds": self._agent_profile.idle_timeout_seconds,
                        "away_count": self._away_count,
                    },
                )
                await self._session.aclose()
                return

            should_rearm_idle_timer = True
        except asyncio.CancelledError:
            if is_final_attempt:
                self.closed_by_idle = False
            raise
        except Exception:
            if is_final_attempt:
                self.closed_by_idle = False
            logger.exception(
                "idle call handling failed",
                extra={"conversation_id": self._metadata.conversation_id},
            )
        finally:
            current_task = asyncio.current_task()
            if self._pending_task is current_task:
                self._pending_task = None
            if should_rearm_idle_timer:
                self._arm_idle_timer_if_needed()

    async def _say_and_wait(self, message: str) -> None:
        audio_output = getattr(getattr(self._session, "output", None), "audio", None)
        audio_enabled = bool(
            getattr(getattr(self._session, "output", None), "audio_enabled", False)
        )
        logger.info(
            "playing idle speech",
            extra={
                "conversation_id": self._metadata.conversation_id,
                "session_mode": self._metadata.session_mode,
                "audio_output_enabled": audio_enabled,
                "has_audio_output": audio_output is not None,
            },
        )
        handle = self._session.say(
            message,
            allow_interruptions=False,
            add_to_chat_ctx=True,
        )
        wait_for_playout = getattr(handle, "wait_for_playout", None)
        if callable(wait_for_playout):
            await wait_for_playout()
            return
        if hasattr(handle, "__await__"):
            await handle
            return
        await asyncio.sleep(0)


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
        opening_message = self._agent_profile.opening_message.strip()
        if not opening_message:
            return

        self.session.say(
            opening_message,
            add_to_chat_ctx=True,
        )

    async def on_user_turn_completed(
        self,
        turn_ctx: ChatContext,
        new_message: ChatMessage,
    ) -> None:
        await self._inject_retrieval_context(
            turn_ctx,
            query=(new_message.text_content or "").strip(),
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
        return await self._search_knowledge_base(query)

    @function_tool()
    async def search_products(
        self,
        context: RunContext,
        query: str = "",
        category: str = "",
        brand: str = "",
        model: str = "",
        sku: str = "",
        status: str = "",
        limit: int = 10,
    ) -> str:
        """Search the structured product catalog for exact models, specs, prices, and product lists.

        Use this tool when the user asks for product models, technical parameters, prices, or comparisons.
        """
        del context
        return await self._search_products(
            query=query,
            category=category,
            brand=brand,
            model=model,
            sku=sku,
            status=status,
            limit=limit,
        )

    @function_tool()
    async def resolve_product_price(
        self,
        context: RunContext,
        product_id: str,
        specs: str = "",
        price_book_code: str = "standard",
        quantity: int = 1,
        effective_at: str = "",
    ) -> str:
        """Resolve the exact price for one product variant by passing full spec conditions.

        Args:
            product_id: The product ID returned by `search_products`.
            specs: Spec conditions in `key=value,key=value` format, for example `diameter=DN80,pressure=PN16`.
            price_book_code: Price book code, default is `standard`.
            quantity: Quantity for tier pricing.
            effective_at: Optional ISO datetime used to match effective price windows.
        """
        del context
        return await self._resolve_product_price(
            product_id=product_id,
            specs=specs,
            price_book_code=price_book_code,
            quantity=quantity,
            effective_at=effective_at,
        )

    def _resolve_search_kb_ids(self) -> list[str]:
        return list(self._agent_profile.knowledge_base_ids)

    async def _search_knowledge_base(self, query: str) -> str:
        kb_ids = self._resolve_search_kb_ids()
        if not kb_ids:
            return "当前智能体没有绑定知识库。"

        try:
            results = await kb_client.search_knowledge_base(
                query=query,
                knowledge_base_ids=kb_ids,
                top_k=self._agent_profile.retrieval_top_k,
            )
        except Exception as exc:
            return f"知识库检索失败：{exc}"

        if not results:
            return "没有检索到相关知识。"

        return self._format_search_results(results)

    async def _search_products(
        self,
        *,
        query: str,
        category: str,
        brand: str,
        model: str,
        sku: str,
        status: str,
        limit: int,
    ) -> str:
        try:
            products = await kb_client.search_products(
                query=query,
                category=category,
                brand=brand,
                model=model,
                sku=sku,
                status=status,
                limit=limit,
            )
        except Exception as exc:
            return f"产品目录查询失败：{exc}"

        if not products:
            return "没有查询到匹配的产品。"

        parts: list[str] = []
        for index, product in enumerate(products, start=1):
            primary_label = (
                str(product.get("model") or "")
                or str(product.get("name") or "")
                or "未命名商品"
            )
            min_price_minor = product.get("min_price_minor")
            max_price_minor = product.get("max_price_minor")
            lines = [
                f"[{index}] {primary_label}",
                f"商品ID：{product.get('id') or '-'}",
                f"名称：{product.get('name') or '-'}",
                f"分类：{product.get('category') or '-'}",
                f"品牌：{product.get('brand') or '-'}",
                f"型号：{product.get('model') or '-'}",
                f"状态：{product.get('status') or '-'}",
                f"变体数：{product.get('variant_count') or 0}",
                f"启用变体数：{product.get('active_variant_count') or 0}",
                f"标准价范围：{self._format_price_range(min_price_minor, max_price_minor, str(product.get('currency') or 'CNY'))}",
                f"更新时间：{product.get('updated_at') or '-'}",
            ]
            parts.append("\n".join(lines))
        return "\n\n".join(parts)

    async def _resolve_product_price(
        self,
        *,
        product_id: str,
        specs: str,
        price_book_code: str,
        quantity: int,
        effective_at: str,
    ) -> str:
        try:
            result = await kb_client.resolve_product_price(
                product_id,
                price_book_code=price_book_code,
                quantity=max(1, quantity),
                effective_at=effective_at.strip() or None,
                specs=self._parse_specs(specs),
            )
        except Exception as exc:
            return f"产品定价查询失败：{exc}"

        if not result:
            return "没有查询到对应的商品。"

        if not result.get("matched"):
            reason = str(result.get("reason") or "")
            if reason == "missing_specs":
                missing = "、".join(result.get("missing_dimensions") or []) or "规格条件"
                return f"缺少必要规格条件：{missing}。"
            if reason == "ambiguous_variant":
                return "当前规格条件仍然不够，命中了多个变体，请补充更多规格。"
            if reason == "variant_not_found":
                return "没有找到匹配该规格组合的变体。"
            if reason == "price_not_found":
                return "找到了对应变体，但没有匹配到有效价格。"
            return "没有匹配到可用价格。"

        price = dict(result.get("price") or {})
        specs_map = dict(result.get("specs") or {})
        spec_lines = [f"{key}={value}" for key, value in specs_map.items()]
        return "\n".join(
            [
                f"商品：{result.get('product_name') or '-'}",
                f"商品ID：{result.get('product_id') or '-'}",
                f"变体：{result.get('variant_name') or result.get('sku') or '-'}",
                f"SKU：{result.get('sku') or '-'}",
                f"规格：{'，'.join(spec_lines) if spec_lines else '-'}",
                f"价格：{self._format_resolved_price(price)}",
            ]
        )

    @staticmethod
    def _parse_specs(specs: str) -> dict[str, str]:
        result: dict[str, str] = {}
        for item in specs.split(","):
            chunk = item.strip()
            if not chunk or "=" not in chunk:
                continue
            key, value = chunk.split("=", 1)
            key = key.strip()
            value = value.strip()
            if key and value:
                result[key] = value
        return result

    @staticmethod
    def _format_minor(amount_minor: object, currency: str) -> str:
        if amount_minor is None:
            return "-"
        amount = int(amount_minor) / 100
        return f"{currency} {amount:.2f}"

    def _format_price_range(self, min_price_minor: object, max_price_minor: object, currency: str) -> str:
        if min_price_minor is None and max_price_minor is None:
            return "-"
        if min_price_minor == max_price_minor:
            return self._format_minor(min_price_minor, currency)
        return (
            f"{self._format_minor(min_price_minor, currency)} ~ "
            f"{self._format_minor(max_price_minor, currency)}"
        )

    def _format_resolved_price(self, price: dict[str, object]) -> str:
        currency = str(price.get("currency") or "CNY")
        pricing_mode = str(price.get("pricing_mode") or "fixed")
        if pricing_mode == "quote":
            return str(price.get("remarks") or "需报价")
        if pricing_mode == "range":
            return self._format_price_range(
                price.get("min_amount_minor"),
                price.get("max_amount_minor"),
                currency,
            )
        return self._format_minor(price.get("amount_minor"), currency)

    def _build_rag_context(self, *, query: str, results: list[dict[str, object]]) -> str:
        return (
            "以下是系统基于当前用户问题自动检索到的知识库片段。"
            "请优先依据这些片段作答，不要脱离片段编造事实。"
            "如果片段仍不足以支持结论，就明确说明知识库信息不足。\n\n"
            f"用户问题：{query}\n\n"
            f"{self._format_search_results(results)}"
        )

    async def build_turn_chat_context(self, query: str) -> ChatContext:
        turn_ctx = self.chat_ctx.copy()
        await self._inject_retrieval_context(turn_ctx, query=query)
        return turn_ctx

    async def _inject_retrieval_context(self, turn_ctx: ChatContext, *, query: str) -> None:
        kb_ids = self._resolve_search_kb_ids()
        query = query.strip()
        if not kb_ids or not query:
            return

        try:
            results = await kb_client.search_knowledge_base(
                query=query,
                knowledge_base_ids=kb_ids,
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

        messages = await kb_client.list_conversation_messages(conversation_id)
        history = ChatContext.empty()
        for message in messages:
            content = str(message.get("content") or "").strip()
            role = str(message.get("role") or "").strip()
            if not content:
                continue
            if role not in {"user", "assistant", "system", "developer"}:
                continue
            history.add_message(
                role="system" if role == "developer" else role,
                content=content,
            )
        if not history.items:
            return

        await self.update_chat_ctx(history)


async def build_session(
    proc: JobProcess,
    metadata: SessionMetadata,
    agent_profile: AgentProfileSettings,
) -> tuple[AgentSession, object | None, object | None]:
    settings.validate()
    stt_profile = (
        None
        if metadata.is_text_mode
        else await kb_client.load_stt_model_settings()
    )
    tts_profile = (
        None
        if metadata.is_text_mode
        else await kb_client.load_tts_model_settings()
    )
    stt_fallback_profiles = (
        []
        if metadata.is_text_mode
        else await kb_client.load_stt_fallback_model_settings(
            profile_ids=settings.stt_fallback_profile_ids,
        )
    )
    tts_fallback_profiles = (
        []
        if metadata.is_text_mode
        else await kb_client.load_tts_fallback_model_settings(
            profile_ids=settings.tts_fallback_profile_ids,
        )
    )
    stt_impl = build_stt(stt_profile, fallback_profiles=stt_fallback_profiles)
    tts_impl = build_tts(tts_profile, fallback_profiles=tts_fallback_profiles)
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
        "user_away_timeout": None,
        "turn_handling": {
            "turn_detection": "vad",
            "endpointing": {
                "mode": "dynamic",
                "min_delay": 0.4,
                "max_delay": 1.2,
            },
            "interruption": {
                "mode": "vad",
                "min_duration": 0.4,
                "min_words": 1,
                "resume_false_interruption": True,
            },
        },
    }
    if stt_impl is not None:
        session_kwargs["stt"] = stt_impl
    if tts_impl is not None:
        session_kwargs["tts"] = tts_impl
    return AgentSession(**session_kwargs), stt_impl, tts_impl


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
            "knowledge_base_ids": agent._resolve_search_kb_ids(),
            "query": query,
        },
    )

    await session.interrupt()
    turn_ctx = await agent.build_turn_chat_context(query)
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


def _normalize_state_name(value: object) -> str:
    if value is None:
        return ""
    candidate = getattr(value, "value", None)
    if isinstance(candidate, str) and candidate:
        return candidate.lower()
    candidate = getattr(value, "name", None)
    if isinstance(candidate, str) and candidate:
        return candidate.lower()
    normalized = str(value).strip().lower()
    if "." in normalized:
        normalized = normalized.rsplit(".", 1)[-1]
    return normalized


def _resolve_conversation_end_state(
    *,
    close_reason: object,
    error: object,
    closed_by_idle: bool,
) -> tuple[str, str]:
    if closed_by_idle:
        return "away_timeout", ""

    if error is not None:
        return "session_error", repr(error)

    normalized_reason = _normalize_state_name(close_reason)
    if normalized_reason in {"participant_disconnected", "user_disconnected", "disconnected"}:
        return "user_disconnect", normalized_reason
    if normalized_reason:
        return normalized_reason, normalized_reason
    return "completed", ""


@server.rtc_session(agent_name=settings.agent_name)
async def entrypoint(ctx: JobContext) -> None:
    raw_metadata = _extract_agent_metadata(ctx)
    metadata = parse_session_metadata(ctx)
    resolved_agent_profile = await kb_client.load_agent_profile_settings(
        agent_profile_id=metadata.agent_profile_id,
        default_retrieval_top_k=settings.kb_top_k,
    )
    metadata.agent_profile_id = resolved_agent_profile.profile_id
    ensured_conversation = await kb_client.ensure_conversation(
        metadata.conversation_id,
        knowledge_base_id=None,
        agent_profile_id=metadata.agent_profile_id,
        last_mode=metadata.session_mode,
    )
    metadata.conversation_id = str(ensured_conversation.get("id") or "") or None
    job_metadata = getattr(getattr(ctx, "job", None), "metadata", None)
    logger.info(
        "starting agent session",
        extra={
            "session_mode": metadata.session_mode,
            "knowledge_base_ids": resolved_agent_profile.knowledge_base_ids,
            "agent_profile_id": metadata.agent_profile_id,
            "conversation_id": metadata.conversation_id,
            "raw_metadata": raw_metadata,
            "job_metadata": job_metadata,
        },
    )
    session, stt_impl, tts_impl = await build_session(
        ctx.proc,
        metadata,
        resolved_agent_profile,
    )
    has_stt = stt_impl is not None
    has_tts = tts_impl is not None
    agent = SalesAgent(settings, metadata, resolved_agent_profile, has_tts=has_tts)
    idle_controller = IdleCallController(session, metadata, resolved_agent_profile)
    await agent.restore_history()

    if hasattr(stt_impl, "on"):
        @stt_impl.on("stt_availability_changed")
        def _handle_stt_availability_changed(event) -> None:
            stt_instance = getattr(event, "stt", None)
            logger.warning(
                "stt availability changed",
                extra={
                    "conversation_id": metadata.conversation_id,
                    "available": getattr(event, "available", None),
                    "stt_label": getattr(stt_instance, "label", type(stt_instance).__name__),
                },
            )

    if hasattr(tts_impl, "on"):
        @tts_impl.on("tts_availability_changed")
        def _handle_tts_availability_changed(event) -> None:
            tts_instance = getattr(event, "tts", None)
            logger.warning(
                "tts availability changed",
                extra={
                    "conversation_id": metadata.conversation_id,
                    "available": getattr(event, "available", None),
                    "tts_label": getattr(tts_instance, "label", type(tts_instance).__name__),
                },
            )

    @session.on("user_state_changed")
    def _handle_user_state_changed(event) -> None:
        state_name = _normalize_state_name(getattr(event, "new_state", None))
        if state_name == "speaking":
            idle_controller.on_user_speaking()
            return
        if state_name == "listening":
            idle_controller.on_user_listening()

    @session.on("agent_state_changed")
    def _handle_agent_state_changed(event) -> None:
        state_name = _normalize_state_name(getattr(event, "new_state", None))
        idle_controller.on_agent_state_changed(state_name)

    @session.on("user_input_transcribed")
    def _handle_user_input_transcribed(event) -> None:
        transcript = str(getattr(event, "transcript", "") or "").strip()
        if not transcript or not bool(getattr(event, "is_final", False)):
            return
        idle_controller.on_user_speaking(reset_away_count=True, update_state=False)

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
        if item.role == "user":
            idle_controller.on_user_speaking(reset_away_count=True, update_state=False)
        if not metadata.conversation_id:
            return
        _schedule_background_task(
            kb_client.append_message(
                metadata.conversation_id,
                role=item.role,
                content=content,
                source_mode=metadata.session_mode,
                external_message_id=item.id,
            ),
            task_name=f"append-message-{metadata.conversation_id}",
            conversation_id=metadata.conversation_id,
        )

    @session.on("close")
    def _handle_close(event) -> None:
        idle_controller.cancel()
        close_reason = getattr(event, "reason", None)
        error = getattr(event, "error", None)
        end_reason, end_detail = _resolve_conversation_end_state(
            close_reason=close_reason,
            error=error,
            closed_by_idle=idle_controller.closed_by_idle,
        )
        if metadata.conversation_id:
            _schedule_background_task(
                kb_client.end_conversation(
                    metadata.conversation_id,
                    reason=end_reason,
                    detail=end_detail,
                ),
                task_name=f"end-conversation-{metadata.conversation_id}",
                conversation_id=metadata.conversation_id,
            )
        logger.info(
            "agent session closed",
            extra={
                "conversation_id": metadata.conversation_id,
                "close_reason": _normalize_state_name(close_reason),
                "closed_by_idle": idle_controller.closed_by_idle,
                "end_reason": end_reason,
                "error": repr(error),
            },
        )

    @session.on("error")
    def _handle_error(event) -> None:
        error = getattr(event, "error", None)
        logger.warning(
            "agent session error",
            extra={
                "conversation_id": metadata.conversation_id,
                "source": type(getattr(event, "source", None)).__name__,
                "recoverable": getattr(error, "recoverable", None),
                "error": repr(error),
            },
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
