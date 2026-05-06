from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


def _default_kb_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "knowledge"


@dataclass
class Settings:
    agent_name: str
    kb_dir: Path
    kb_top_k: int
    price_stale_after_days: int
    llm_model: str
    llm_base_url: str
    llm_api_key: str
    stt_descriptor: Optional[str]
    tts_descriptor: Optional[str]

    @classmethod
    def from_env(cls) -> "Settings":
        kb_dir = Path(os.getenv("KB_DIR", str(_default_kb_dir()))).expanduser()
        if not kb_dir.is_absolute():
            kb_dir = Path.cwd() / kb_dir

        return cls(
            agent_name=os.getenv("AGENT_NAME", "sales-kb-agent"),
            kb_dir=kb_dir,
            kb_top_k=int(os.getenv("KB_TOP_K", "3")),
            price_stale_after_days=int(os.getenv("PRICE_STALE_AFTER_DAYS", "3")),
            llm_model=os.getenv("OPENAI_COMPAT_MODEL", ""),
            llm_base_url=os.getenv("OPENAI_COMPAT_BASE_URL", ""),
            llm_api_key=os.getenv("OPENAI_COMPAT_API_KEY", ""),
            stt_descriptor=_optional_env("STT_DESCRIPTOR"),
            tts_descriptor=_optional_env("TTS_DESCRIPTOR"),
        )

    def validate(self) -> None:
        missing = []
        if not self.llm_model:
            missing.append("OPENAI_COMPAT_MODEL")
        if not self.llm_base_url:
            missing.append("OPENAI_COMPAT_BASE_URL")
        if not self.llm_api_key:
            missing.append("OPENAI_COMPAT_API_KEY")
        if missing:
            raise ValueError(f"Missing required environment variables: {', '.join(missing)}")


def _optional_env(name: str) -> Optional[str]:
    value = os.getenv(name, "").strip()
    return value or None
