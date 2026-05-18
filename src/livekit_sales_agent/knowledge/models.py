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
class ProductRecord:
    id: str
    name: str
    category: str
    brand: str
    model: str
    aliases: str
    status: str
    summary: str
    tags: str
    attributes: str
    created_at: str
    updated_at: str


@dataclass
class ProductListItemRecord:
    id: str
    name: str
    category: str
    brand: str
    model: str
    status: str
    variant_count: int
    active_variant_count: int
    min_price_minor: int | None
    max_price_minor: int | None
    currency: str
    updated_at: str


@dataclass
class ProductSpecDimensionOptionRecord:
    id: str
    dimension_id: str
    option_key: str
    option_label: str
    sort_order: int
    is_active: int
    created_at: str
    updated_at: str


@dataclass
class ProductSpecDimensionRecord:
    id: str
    product_id: str
    key: str
    label: str
    value_type: str
    unit: str
    is_required: int
    sort_order: int
    created_at: str
    updated_at: str
    options: list[ProductSpecDimensionOptionRecord] | None = None


@dataclass
class PriceBookRecord:
    id: str
    code: str
    name: str
    currency: str
    audience_type: str
    priority: int
    status: str
    created_at: str
    updated_at: str


@dataclass
class ProductVariantSpecValueRecord:
    id: str
    variant_id: str
    dimension_id: str
    dimension_key: str
    dimension_label: str
    option_id: str | None
    option_key: str | None
    value_text: str
    value_number: float | None
    value_display: str
    sort_value: float | None
    created_at: str
    updated_at: str


@dataclass
class ProductVariantPriceRecord:
    id: str
    variant_id: str
    price_book_id: str
    price_book_code: str
    price_book_name: str
    currency: str
    pricing_mode: str
    amount_minor: int | None
    min_amount_minor: int | None
    max_amount_minor: int | None
    min_qty: int
    effective_from: str | None
    effective_to: str | None
    tax_included: int
    remarks: str
    created_at: str
    updated_at: str


@dataclass
class ProductVariantRecord:
    id: str
    product_id: str
    sku: str
    variant_name: str
    spec_signature: str
    status: str
    barcode: str
    weight: float | None
    lead_time_days: int | None
    is_default: int
    created_at: str
    updated_at: str
    specs: list[ProductVariantSpecValueRecord] | None = None
    prices: list[ProductVariantPriceRecord] | None = None


@dataclass
class ProductCatalogRecord:
    product: ProductRecord
    dimensions: list[ProductSpecDimensionRecord]
    variants: list[ProductVariantRecord]
    price_books: list[PriceBookRecord]


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
class AgentProfileRecord:
    id: str
    name: str
    description: str
    opening_message: str
    idle_timeout_seconds: float
    max_idle_reminders: int
    idle_reminder_message: str
    idle_goodbye_message: str
    system_prompt: str
    fallback_prompt: str
    chat_model_profile_id: Optional[str]
    retrieval_top_k: int
    is_default: int
    created_at: str
    updated_at: str
    knowledge_base_ids: list[str] | None = None


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
