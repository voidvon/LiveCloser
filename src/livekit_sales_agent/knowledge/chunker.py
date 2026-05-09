from __future__ import annotations

from dataclasses import dataclass

from .loaders import LoadedSection


@dataclass
class ChunkCandidate:
    section_title: str
    content: str
    chunk_index: int


def chunk_sections(
    sections: list[LoadedSection], *, chunk_size: int, chunk_overlap: int
) -> list[ChunkCandidate]:
    candidates: list[ChunkCandidate] = []
    next_index = 0

    for section in sections:
        text = normalize_text(section.content)
        if not text:
            continue
        start = 0
        while start < len(text):
            end = min(len(text), start + chunk_size)
            chunk_text = text[start:end].strip()
            if chunk_text:
                candidates.append(
                    ChunkCandidate(
                        section_title=section.title,
                        content=chunk_text,
                        chunk_index=next_index,
                    )
                )
                next_index += 1
            if end >= len(text):
                break
            start = max(end - chunk_overlap, start + 1)

    return candidates


def normalize_text(text: str) -> str:
    return "\n".join(line.strip() for line in text.splitlines() if line.strip()).strip()
