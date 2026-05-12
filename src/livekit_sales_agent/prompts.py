from __future__ import annotations

from .defaults import DEFAULT_FALLBACK_PROMPT, DEFAULT_SYSTEM_PROMPT
from .config import Settings


def build_instructions(
    settings: Settings,
    *,
    system_prompt: str = "",
    fallback_prompt: str = "",
    retrieval_top_k: int | None = None,
) -> str:
    effective_system_prompt = system_prompt.strip() or DEFAULT_SYSTEM_PROMPT
    effective_fallback_prompt = fallback_prompt.strip() or DEFAULT_FALLBACK_PROMPT
    effective_retrieval_top_k = retrieval_top_k or settings.kb_top_k
    return f"""
{effective_system_prompt}

知识库回答兜底规则：
- {effective_fallback_prompt}

知识库配置：
- 默认每次最多参考 {effective_retrieval_top_k} 条知识
- 价格过期阈值：{settings.price_stale_after_days} 天
""".strip()
