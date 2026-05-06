from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Iterable, Optional


WORD_RE = re.compile(r"[a-z0-9_+-]+", re.IGNORECASE)
CJK_RE = re.compile(r"[\u4e00-\u9fff]+")


@dataclass
class KnowledgeChunk:
    chunk_id: str
    title: str
    content: str
    source: str
    updated_at: Optional[str] = None
    keywords: tuple[str, ...] = ()
    category: Optional[str] = None
    price: Optional[str] = None


@dataclass
class SearchResult:
    chunk: KnowledgeChunk
    score: float
    is_stale: bool


class KnowledgeBase:
    def __init__(self, chunks: Iterable[KnowledgeChunk], stale_after_days: int = 3):
        self._chunks = list(chunks)
        self._stale_after_days = stale_after_days

    @classmethod
    def from_directory(cls, kb_dir: Path, stale_after_days: int = 3) -> "KnowledgeBase":
        chunks: list[KnowledgeChunk] = []
        for path in sorted(kb_dir.rglob("*")):
            if path.suffix.lower() == ".json":
                chunks.extend(_load_json_chunks(path))
            elif path.suffix.lower() in {".md", ".markdown"}:
                chunks.extend(_load_markdown_chunks(path))
        return cls(chunks, stale_after_days=stale_after_days)

    def search(self, query: str, limit: int = 3) -> list[SearchResult]:
        ranked: list[SearchResult] = []
        query_tokens = _tokenize(query)

        for chunk in self._chunks:
            haystack = " ".join(
                filter(
                    None,
                    [
                        chunk.title,
                        chunk.content,
                        " ".join(chunk.keywords),
                        chunk.price or "",
                        chunk.category or "",
                    ],
                )
            )
            score = _score_text(query, query_tokens, haystack, chunk.title, chunk.keywords)
            if score <= 0:
                continue
            ranked.append(
                SearchResult(
                    chunk=chunk,
                    score=score,
                    is_stale=_is_stale(chunk.updated_at, self._stale_after_days),
                )
            )

        ranked.sort(key=lambda item: (item.score, item.chunk.updated_at or ""), reverse=True)
        return ranked[:limit]

    def render_context(self, query: str, limit: int = 3) -> str:
        results = self.search(query, limit=limit)
        if not results:
            return "没有找到匹配知识。"

        parts: list[str] = []
        for idx, result in enumerate(results, start=1):
            chunk = result.chunk
            stale_note = "；注意：价格可能过期，需要人工确认" if result.is_stale else ""
            price_line = f"\n价格：{chunk.price}" if chunk.price else ""
            updated_line = f"\n更新时间：{chunk.updated_at}" if chunk.updated_at else ""
            parts.append(
                (
                    f"[{idx}] {chunk.title}\n"
                    f"来源：{chunk.source}{price_line}{updated_line}{stale_note}\n"
                    f"{chunk.content.strip()}"
                ).strip()
            )
        return "\n\n".join(parts)


def _load_json_chunks(path: Path) -> list[KnowledgeChunk]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload["documents"] if isinstance(payload, dict) and "documents" in payload else payload
    if not isinstance(rows, list):
        raise ValueError(f"JSON knowledge file must be a list: {path}")

    chunks: list[KnowledgeChunk] = []
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            continue
        chunks.append(
            KnowledgeChunk(
                chunk_id=str(row.get("id", f"{path.stem}-{index}")),
                title=str(row.get("title", path.stem)),
                content=str(row.get("content", "")).strip(),
                source=path.name,
                updated_at=_maybe_str(row.get("updated_at")),
                keywords=tuple(_normalize_keywords(row.get("keywords", []))),
                category=_maybe_str(row.get("category")),
                price=_maybe_str(row.get("price")),
            )
        )
    return chunks


def _load_markdown_chunks(path: Path) -> list[KnowledgeChunk]:
    raw = path.read_text(encoding="utf-8")
    sections = re.split(r"^##\s+", raw, flags=re.MULTILINE)
    chunks: list[KnowledgeChunk] = []

    preface = sections[0].strip()
    if preface:
        chunks.append(
            KnowledgeChunk(
                chunk_id=f"{path.stem}-intro",
                title=path.stem,
                content=preface,
                source=path.name,
            )
        )

    for index, section in enumerate(sections[1:], start=1):
        lines = section.splitlines()
        if not lines:
            continue
        title = lines[0].strip()
        content = "\n".join(lines[1:]).strip()
        if not content:
            continue
        chunks.append(
            KnowledgeChunk(
                chunk_id=f"{path.stem}-{index}",
                title=title,
                content=content,
                source=path.name,
                keywords=tuple(_tokenize(title)),
            )
        )
    return chunks


def _tokenize(text: str) -> set[str]:
    lowered = text.lower()
    tokens = set(WORD_RE.findall(lowered))
    for block in CJK_RE.findall(text):
        tokens.add(block)
        if len(block) == 1:
            continue
        tokens.update(block[i : i + 2] for i in range(len(block) - 1))
    return {token for token in tokens if token.strip()}


def _score_text(
    query: str,
    query_tokens: set[str],
    haystack: str,
    title: str,
    keywords: tuple[str, ...],
) -> float:
    haystack_lower = haystack.lower()
    title_lower = title.lower()
    score = 0.0

    if query.lower() in haystack_lower:
        score += 8.0
    if query.lower() in title_lower:
        score += 6.0

    haystack_tokens = _tokenize(haystack)
    overlap = query_tokens & haystack_tokens
    score += len(overlap) * 1.5

    keyword_hits = sum(1 for keyword in keywords if keyword.lower() in query.lower())
    score += keyword_hits * 2.0

    return score


def _is_stale(updated_at: Optional[str], stale_after_days: int) -> bool:
    if not updated_at:
        return False
    try:
        updated = date.fromisoformat(updated_at)
    except ValueError:
        return False
    return (date.today() - updated).days > stale_after_days


def _normalize_keywords(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


def _maybe_str(value: object) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
