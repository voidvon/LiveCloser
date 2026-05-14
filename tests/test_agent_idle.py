from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from agent import IdleCallController, SessionMetadata  # noqa: E402
from livekit_sales_agent.config import AgentProfileSettings, ChatModelSettings  # noqa: E402


class _FakeSpeechHandle:
    def __init__(self) -> None:
        self.waited = False

    async def wait_for_playout(self) -> None:
        self.waited = True


class _FakeSessionOutput:
    def __init__(self) -> None:
        self.audio = object()
        self.audio_enabled = True


class _FakeSession:
    def __init__(self) -> None:
        self.output = _FakeSessionOutput()
        self.say_calls: list[dict[str, object]] = []
        self.handle = _FakeSpeechHandle()
        self.closed = False

    def say(self, message: str, **kwargs):
        self.say_calls.append({"message": message, **kwargs})
        return self.handle

    async def aclose(self) -> None:
        self.closed = True


def _build_agent_profile(
    *,
    idle_timeout_seconds: float = 10.0,
    max_idle_reminders: int = 1,
) -> AgentProfileSettings:
    return AgentProfileSettings(
        profile_id="agent-1",
        name="测试智能体",
        description="",
        opening_message="你好",
        idle_timeout_seconds=idle_timeout_seconds,
        max_idle_reminders=max_idle_reminders,
        idle_reminder_message="喂，您还在吗？",
        idle_goodbye_message="我先不打扰您了。",
        system_prompt="",
        fallback_prompt="",
        retrieval_top_k=3,
        knowledge_base_ids=[],
        chat_model=ChatModelSettings(
            model="gpt-4.1-mini",
            base_url="https://api.openai.com/v1",
            api_key="test-key",
        ),
    )


class IdleCallControllerTest(unittest.IsolatedAsyncioTestCase):
    async def test_idle_speech_is_non_interruptible_and_waits_for_playout(self) -> None:
        session = _FakeSession()
        controller = IdleCallController(
            session=session,
            metadata=SessionMetadata(session_mode="voice", conversation_id="conv-1"),
            agent_profile=_build_agent_profile(),
        )

        await controller._say_and_wait("喂，您还在吗？")

        self.assertEqual(len(session.say_calls), 1)
        self.assertEqual(session.say_calls[0]["message"], "喂，您还在吗？")
        self.assertIs(session.say_calls[0]["allow_interruptions"], False)
        self.assertIs(session.say_calls[0]["add_to_chat_ctx"], True)
        self.assertTrue(session.handle.waited)

    async def test_vad_speaking_does_not_reset_away_count(self) -> None:
        session = _FakeSession()
        controller = IdleCallController(
            session=session,
            metadata=SessionMetadata(session_mode="voice", conversation_id="conv-2"),
            agent_profile=_build_agent_profile(),
        )

        controller._away_count = 1

        controller.on_user_speaking()
        self.assertEqual(controller._away_count, 1)

    async def test_final_user_transcript_resets_away_count(self) -> None:
        session = _FakeSession()
        controller = IdleCallController(
            session=session,
            metadata=SessionMetadata(session_mode="voice", conversation_id="conv-3"),
            agent_profile=_build_agent_profile(),
        )

        controller._away_count = 1

        controller.on_user_speaking(reset_away_count=True, update_state=False)
        self.assertEqual(controller._away_count, 0)

    async def test_final_user_transcript_does_not_force_user_back_to_speaking(self) -> None:
        session = _FakeSession()
        controller = IdleCallController(
            session=session,
            metadata=SessionMetadata(session_mode="voice", conversation_id="conv-3b"),
            agent_profile=_build_agent_profile(),
        )

        controller.on_user_listening()
        controller.on_agent_state_changed("listening")
        self.assertIsNotNone(controller._idle_timer_task)

        controller.on_user_speaking(reset_away_count=True, update_state=False)
        self.assertEqual(controller._user_state, "listening")

        controller.on_agent_state_changed("thinking")
        controller.on_agent_state_changed("listening")
        self.assertIsNotNone(controller._idle_timer_task)

    async def test_agent_speaking_pauses_idle_timer_until_listening_again(self) -> None:
        session = _FakeSession()
        controller = IdleCallController(
            session=session,
            metadata=SessionMetadata(session_mode="voice", conversation_id="conv-state"),
            agent_profile=_build_agent_profile(),
        )

        controller.on_user_listening()
        controller.on_agent_state_changed("listening")
        first_timer = controller._idle_timer_task

        self.assertIsNotNone(first_timer)

        controller.on_agent_state_changed("speaking")
        with self.assertRaises(asyncio.CancelledError):
            await first_timer
        self.assertIsNone(controller._idle_timer_task)

        controller.on_agent_state_changed("listening")
        self.assertIsNotNone(controller._idle_timer_task)
        self.assertIsNot(controller._idle_timer_task, first_timer)

    async def test_idle_reminder_escalates_to_goodbye_and_closes_session(self) -> None:
        session = _FakeSession()
        controller = IdleCallController(
            session=session,
            metadata=SessionMetadata(session_mode="voice", conversation_id="conv-4"),
            agent_profile=_build_agent_profile(idle_timeout_seconds=10.0, max_idle_reminders=1),
        )

        sleep_futures: list[asyncio.Future[None]] = []

        async def _controlled_sleep(_: float) -> None:
            fut = asyncio.get_running_loop().create_future()
            sleep_futures.append(fut)
            await fut

        with patch("agent.asyncio.sleep", new=_controlled_sleep):
            controller.on_user_listening()
            controller.on_agent_state_changed("listening")
            assert controller._idle_timer_task is not None
            with self.assertRaises(asyncio.TimeoutError):
                await asyncio.wait_for(asyncio.shield(controller._idle_timer_task), timeout=0.001)
            self.assertEqual(len(sleep_futures), 1)
            sleep_futures[0].set_result(None)
            await controller._idle_timer_task
            if controller._pending_task is not None:
                await controller._pending_task
            self.assertEqual([call["message"] for call in session.say_calls], ["喂，您还在吗？"])
            self.assertEqual(controller._away_count, 1)
            assert controller._idle_timer_task is not None
            with self.assertRaises(asyncio.TimeoutError):
                await asyncio.wait_for(asyncio.shield(controller._idle_timer_task), timeout=0.001)
            self.assertEqual(len(sleep_futures), 2)
            assert controller._idle_timer_task is not None
            sleep_futures[1].set_result(None)
            await controller._idle_timer_task
            if controller._pending_task is not None:
                await controller._pending_task

        self.assertEqual(
            [call["message"] for call in session.say_calls],
            ["喂，您还在吗？", "我先不打扰您了。"],
        )
        self.assertTrue(session.closed)
        self.assertEqual(controller._away_count, 2)


if __name__ == "__main__":
    unittest.main()
