from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from livekit_sales_agent.config import ChatModelSettings  # noqa: E402


class ChatModelSettingsTest(unittest.TestCase):
    def test_detects_deepseek_v4_models(self) -> None:
        profile = ChatModelSettings(
            model="deepseek-v4-flash",
            base_url="https://api.deepseek.com/v1",
            api_key="test-key",
        )
        self.assertTrue(profile.is_deepseek_v4)

    def test_ignores_non_v4_or_non_deepseek_models(self) -> None:
        self.assertFalse(
            ChatModelSettings(
                model="deepseek-chat",
                base_url="https://api.deepseek.com/v1",
                api_key="test-key",
            ).is_deepseek_v4
        )
        self.assertFalse(
            ChatModelSettings(
                model="gpt-4.1",
                base_url="https://api.openai.com/v1",
                api_key="test-key",
            ).is_deepseek_v4
        )


if __name__ == "__main__":
    unittest.main()
