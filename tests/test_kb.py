from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from livekit_sales_agent.kb import KnowledgeBase  # noqa: E402


class KnowledgeBaseTest(unittest.TestCase):
    def setUp(self) -> None:
        self.kb = KnowledgeBase.from_directory(ROOT / "knowledge", stale_after_days=3)

    def test_json_price_search_returns_updated_at(self) -> None:
        context = self.kb.render_context("增长版多少钱", limit=2)
        self.assertIn("增长版套餐", context)
        self.assertIn("6999 元 / 年", context)
        self.assertIn("更新时间：2026-05-06", context)

    def test_markdown_search_finds_faq(self) -> None:
        results = self.kb.search("怎么推进成交", limit=2)
        self.assertTrue(results)
        self.assertIn("如何推进成交", results[0].chunk.title)


if __name__ == "__main__":
    unittest.main()
