from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class KnowledgeBasePayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    embedding_profile_id: Optional[str] = None
    embedding_provider: str = "openai_compatible"
    embedding_model: str = ""
    embedding_base_url: str = ""
    embedding_api_key_env: str = ""
    chunk_size: int = 800
    chunk_overlap: int = 120
    retrieval_top_k: int = 5


class ProductPayload(BaseModel):
    name: str = ""
    category: str = ""
    brand: str = ""
    model: str = Field(default="", max_length=120)
    sku: str = ""
    aliases: str = ""
    price: str = ""
    currency: str = "CNY"
    status: str = "active"
    summary: str = ""
    tags: str = ""
    attributes: str = ""


class CategoryPayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    parent_id: Optional[str] = None
    sort_order: int = 0


class EmbeddingProfilePayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    provider: str = "openai_compatible"
    model: str = ""
    base_url: str = ""
    api_key_env: str = ""


class FileUpdatePayload(BaseModel):
    original_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    content: Optional[str] = None
    category_id: Optional[str] = None


class RewriteMessagePayload(BaseModel):
    role: str
    content: str


class FileRewritePayload(BaseModel):
    instruction: str = Field(min_length=1, max_length=4000)
    content: str
    file_name: str = Field(min_length=1, max_length=255)
    history: list[RewriteMessagePayload] = Field(default_factory=list)
    selected_text: Optional[str] = None


class ChatModelProfilePayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    provider: str = "openai_compatible"
    model: str = ""
    base_url: str = ""
    api_key: str = ""
    is_default: bool = False


class AgentProfilePayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    opening_message: str = ""
    idle_timeout_seconds: float = 10.0
    max_idle_reminders: int = 1
    idle_reminder_message: str = ""
    idle_goodbye_message: str = ""
    system_prompt: str = ""
    fallback_prompt: str = ""
    chat_model_profile_id: Optional[str] = None
    retrieval_top_k: int = 5
    knowledge_base_ids: list[str] = Field(default_factory=list)
    is_default: bool = False


class SttModelProfilePayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    provider: str = "doubao"
    auth_mode: str = "api_key"
    api_key: str = ""
    app_id: str = ""
    access_token: str = ""
    uid: str = "livekit-sales-user"
    resource_id: str = ""
    cluster: str = ""
    ws_url: str = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async"
    language: str = "zh-CN"
    is_default: bool = False


class TtsModelProfilePayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    provider: str = "doubao"
    auth_mode: str = "api_key"
    api_key: str = ""
    app_id: str = ""
    access_token: str = ""
    uid: str = "livekit-sales-user"
    resource_id: str = ""
    cluster: str = ""
    http_url: str = "https://openspeech.bytedance.com/api/v3/tts/unidirectional"
    voice_type: str = ""
    encoding: str = "mp3"
    sample_rate: int = 24000
    speed_ratio: float = 1.0
    volume_ratio: float = 1.0
    pitch_ratio: float = 1.0
    is_default: bool = False


class ConversationPayload(BaseModel):
    title: str = "新会话"
    knowledge_base_id: Optional[str] = None
    agent_profile_id: Optional[str] = None
    last_mode: str = "text"


class ConversationUpdatePayload(BaseModel):
    title: Optional[str] = None
    knowledge_base_id: Optional[str] = None
    agent_profile_id: Optional[str] = None
    last_mode: Optional[str] = None


class RetrievalSearchPayload(BaseModel):
    query: str = Field(min_length=1, max_length=4000)
    knowledge_base_ids: list[str] = Field(default_factory=list)
    top_k: int = 5


class ConversationEnsurePayload(BaseModel):
    conversation_id: Optional[str] = None
    knowledge_base_id: Optional[str] = None
    agent_profile_id: Optional[str] = None
    last_mode: str = "text"


class ConversationMessagePayload(BaseModel):
    role: str
    content: str
    source_mode: str = "text"
    external_message_id: Optional[str] = None


class ConversationEndPayload(BaseModel):
    reason: str = Field(min_length=1, max_length=120)
    detail: str = ""


class FallbackProfilesPayload(BaseModel):
    profile_ids: list[str] = Field(default_factory=list)
