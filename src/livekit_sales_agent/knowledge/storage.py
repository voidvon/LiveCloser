from __future__ import annotations

import hashlib
from pathlib import Path
from uuid import uuid4

EDITABLE_TEXT_SUFFIXES = {".txt", ".md", ".markdown"}


def save_uploaded_file(
    *,
    root_dir: Path,
    kb_id: str,
    original_name: str,
    content: bytes,
) -> tuple[Path, str]:
    target_dir = root_dir / kb_id
    target_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(original_name).suffix
    filename = f"{uuid4()}{ext}"
    path = target_dir / filename
    path.write_bytes(content)
    return path, hashlib.sha256(content).hexdigest()


def is_editable_text_file_name(file_name: str) -> bool:
    return Path(file_name).suffix.lower() in EDITABLE_TEXT_SUFFIXES


def normalize_file_name(file_name: str) -> str:
    value = file_name.strip()
    if not value:
        raise ValueError("文件名不能为空")
    normalized = Path(value).name
    if normalized != value:
        raise ValueError("文件名不能包含路径")
    if normalized in {".", ".."}:
        raise ValueError("文件名不合法")
    return normalized


def read_text_file(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text_file(path: Path, content: str) -> tuple[int, str]:
    payload = content.encode("utf-8")
    path.write_bytes(payload)
    return len(payload), hashlib.sha256(payload).hexdigest()
