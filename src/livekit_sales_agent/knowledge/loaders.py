from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path


@dataclass
class LoadedSection:
    title: str
    content: str


def load_sections(path: Path) -> list[LoadedSection]:
    suffix = path.suffix.lower()
    if suffix in {".md", ".markdown"}:
        return _load_markdown(path)
    if suffix == ".txt":
        return [LoadedSection(title=path.stem, content=path.read_text(encoding="utf-8"))]
    if suffix == ".json":
        return _load_json(path)
    raise ValueError(f"暂不支持的文件类型: {path.suffix}")


def _load_markdown(path: Path) -> list[LoadedSection]:
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        return []

    sections = re.split(r"^##\s+", raw, flags=re.MULTILINE)
    loaded: list[LoadedSection] = []

    intro = sections[0].strip()
    if intro:
        loaded.append(LoadedSection(title=path.stem, content=intro))

    for section in sections[1:]:
        lines = section.splitlines()
        if not lines:
            continue
        title = lines[0].strip() or path.stem
        content = "\n".join(lines[1:]).strip()
        if content:
            loaded.append(LoadedSection(title=title, content=content))

    return loaded


def _load_json(path: Path) -> list[LoadedSection]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload["documents"] if isinstance(payload, dict) and "documents" in payload else payload
    if not isinstance(rows, list):
        raise ValueError(f"JSON 文件必须是数组或包含 documents 数组: {path.name}")

    sections: list[LoadedSection] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        title = str(row.get("title") or row.get("name") or path.stem).strip()
        content = str(row.get("content") or row.get("description") or "").strip()
        if content:
            sections.append(LoadedSection(title=title, content=content))
    return sections
