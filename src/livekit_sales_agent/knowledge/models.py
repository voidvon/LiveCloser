from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class KnowledgeBaseRecord:
    id: str
    name: str
    description: str
    embedding_profile_id: Optional[str]
    embedding_provider: str
    embedding_model: str
    embedding_base_url: str
    embedding_api_key_env: str
    chunk_size: int
    chunk_overlap: int
    retrieval_top_k: int
    created_at: str
    updated_at: str


@dataclass
class EmbeddingProfileRecord:
    id: str
    name: str
    provider: str
    model: str
    base_url: str
    api_key_env: str
    created_at: str
    updated_at: str


@dataclass
class ChatModelProfileRecord:
    id: str
    name: str
    provider: str
    model: str
    base_url: str
    api_key: str
    is_default: int
    created_at: str
    updated_at: str


@dataclass
class SttModelProfileRecord:
    id: str
    name: str
    provider: str
    auth_mode: str
    api_key: str
    app_id: str
    access_token: str
    uid: str
    resource_id: str
    cluster: str
    ws_url: str
    language: str
    is_default: int
    created_at: str
    updated_at: str


@dataclass
class TtsModelProfileRecord:
    id: str
    name: str
    provider: str
    auth_mode: str
    api_key: str
    app_id: str
    access_token: str
    uid: str
    resource_id: str
    cluster: str
    http_url: str
    voice_type: str
    encoding: str
    sample_rate: int
    speed_ratio: float
    volume_ratio: float
    pitch_ratio: float
    is_default: int
    created_at: str
    updated_at: str


@dataclass
class CategoryRecord:
    id: str
    kb_id: str
    name: str
    parent_id: Optional[str]
    sort_order: int
    created_at: str
    updated_at: str


@dataclass
class FileRecord:
    id: str
    kb_id: str
    category_id: Optional[str]
    original_name: str
    stored_path: str
    mime_type: str
    size_bytes: int
    content_hash: str
    status: str
    created_at: str
    updated_at: str
    last_embedded_at: Optional[str]


@dataclass
class JobRecord:
    id: str
    kb_id: str
    file_id: Optional[str]
    job_type: str
    status: str
    error_message: str
    created_at: str
    started_at: Optional[str]
    finished_at: Optional[str]


@dataclass
class ChunkRecord:
    id: str
    kb_id: str
    file_id: str
    chunk_index: int
    section_title: str
    content_preview: str
    chroma_doc_id: str
    category_id: Optional[str]
    created_at: str


@dataclass
class ChunkDocument:
    chunk_id: str
    kb_id: str
    file_id: str
    category_id: Optional[str]
    source_path: str
    title: str
    content: str
    chunk_index: int
