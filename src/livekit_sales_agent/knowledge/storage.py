from __future__ import annotations

import hashlib
from pathlib import Path
from uuid import uuid4


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
