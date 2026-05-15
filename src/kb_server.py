from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from livekit_sales_agent.conversation import ConversationService
from livekit_sales_agent.conversation.service import _UNSET
from livekit_sales_agent.knowledge.db import ensure_database
from livekit_sales_agent.knowledge.service import KnowledgeService


def _data_root() -> Path:
    value = os.getenv("KB_DATA_DIR", ".data/kb")
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = Path.cwd() / path
    return path


DATA_ROOT = _data_root()
DB_PATH = DATA_ROOT / "app.db"
FILES_ROOT = DATA_ROOT / "files"
CHROMA_ROOT = DATA_ROOT / "chroma"

ensure_database(DB_PATH)
service = KnowledgeService(db_path=DB_PATH, files_root=FILES_ROOT, chroma_root=CHROMA_ROOT)
conversation_service = ConversationService(db_path=DB_PATH)
service.resume_pending_jobs()

app = FastAPI(title="Knowledge Base Service", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/knowledge-bases")
def list_knowledge_bases():
    return service.list_knowledge_bases()


@app.get("/products")
def list_products(
    query: str = "",
    category: str = "",
    brand: str = "",
    model: str = "",
    sku: str = "",
    status: str = "",
    limit: int = 200,
):
    return service.list_products(
        query=query,
        category=category,
        brand=brand,
        model=model,
        sku=sku,
        status=status,
        limit=limit,
    )


@app.post("/products")
def create_product(payload: ProductPayload):
    try:
        return service.create_product(**payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.patch("/products/{product_id}")
def update_product(product_id: str, payload: ProductPayload):
    try:
        record = service.update_product(product_id, **payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if record is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return record


@app.delete("/products/{product_id}")
def delete_product(product_id: str):
    deleted = service.delete_product(product_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"ok": True}


@app.get("/embedding-profiles")
def list_embedding_profiles():
    return service.list_embedding_profiles()


@app.get("/chat-model-profiles")
def list_chat_model_profiles():
    return service.list_chat_model_profiles()


@app.get("/agent-profiles")
def list_agent_profiles():
    return service.list_agent_profiles()


@app.get("/stt-model-profiles")
def list_stt_model_profiles():
    return service.list_stt_model_profiles()


@app.get("/tts-model-profiles")
def list_tts_model_profiles():
    return service.list_tts_model_profiles()


@app.post("/chat-model-profiles")
def create_chat_model_profile(payload: ChatModelProfilePayload):
    return service.create_chat_model_profile(**payload.model_dump())


@app.post("/agent-profiles")
def create_agent_profile(payload: AgentProfilePayload):
    try:
        return service.create_agent_profile(**payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.patch("/agent-profiles/{profile_id}")
def update_agent_profile(profile_id: str, payload: AgentProfilePayload):
    try:
        record = service.update_agent_profile(profile_id, **payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if record is None:
        raise HTTPException(status_code=404, detail="Agent profile not found")
    return record


@app.delete("/agent-profiles/{profile_id}")
def delete_agent_profile(profile_id: str):
    deleted = service.delete_agent_profile(profile_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Agent profile not found")
    return {"ok": True}


@app.patch("/chat-model-profiles/{profile_id}")
def update_chat_model_profile(profile_id: str, payload: ChatModelProfilePayload):
    record = service.update_chat_model_profile(profile_id, **payload.model_dump())
    if record is None:
        raise HTTPException(status_code=404, detail="Chat model profile not found")
    return record


@app.post("/chat-model-profiles/{profile_id}/default")
def set_default_chat_model_profile(profile_id: str):
    record = service.set_default_chat_model_profile(profile_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Chat model profile not found")
    return record


@app.delete("/chat-model-profiles/{profile_id}")
def delete_chat_model_profile(profile_id: str):
    deleted = service.delete_chat_model_profile(profile_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Chat model profile not found")
    return {"ok": True}


@app.post("/stt-model-profiles")
def create_stt_model_profile(payload: SttModelProfilePayload):
    return service.create_stt_model_profile(**payload.model_dump())


@app.patch("/stt-model-profiles/{profile_id}")
def update_stt_model_profile(profile_id: str, payload: SttModelProfilePayload):
    record = service.update_stt_model_profile(profile_id, **payload.model_dump())
    if record is None:
        raise HTTPException(status_code=404, detail="STT model profile not found")
    return record


@app.post("/stt-model-profiles/{profile_id}/default")
def set_default_stt_model_profile(profile_id: str):
    record = service.set_default_stt_model_profile(profile_id)
    if record is None:
        raise HTTPException(status_code=404, detail="STT model profile not found")
    return record


@app.delete("/stt-model-profiles/{profile_id}")
def delete_stt_model_profile(profile_id: str):
    deleted = service.delete_stt_model_profile(profile_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="STT model profile not found")
    return {"ok": True}


@app.post("/tts-model-profiles")
def create_tts_model_profile(payload: TtsModelProfilePayload):
    return service.create_tts_model_profile(**payload.model_dump())


@app.patch("/tts-model-profiles/{profile_id}")
def update_tts_model_profile(profile_id: str, payload: TtsModelProfilePayload):
    record = service.update_tts_model_profile(profile_id, **payload.model_dump())
    if record is None:
        raise HTTPException(status_code=404, detail="TTS model profile not found")
    return record


@app.post("/tts-model-profiles/{profile_id}/default")
def set_default_tts_model_profile(profile_id: str):
    record = service.set_default_tts_model_profile(profile_id)
    if record is None:
        raise HTTPException(status_code=404, detail="TTS model profile not found")
    return record


@app.delete("/tts-model-profiles/{profile_id}")
def delete_tts_model_profile(profile_id: str):
    deleted = service.delete_tts_model_profile(profile_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="TTS model profile not found")
    return {"ok": True}


@app.post("/embedding-profiles")
def create_embedding_profile(payload: EmbeddingProfilePayload):
    return service.create_embedding_profile(**payload.model_dump())


@app.patch("/embedding-profiles/{profile_id}")
def update_embedding_profile(profile_id: str, payload: EmbeddingProfilePayload):
    record = service.update_embedding_profile(profile_id, **payload.model_dump())
    if record is None:
        raise HTTPException(status_code=404, detail="Embedding profile not found")
    return record


@app.delete("/embedding-profiles/{profile_id}")
def delete_embedding_profile(profile_id: str):
    deleted, in_use = service.delete_embedding_profile(profile_id)
    if in_use:
        raise HTTPException(status_code=409, detail="Embedding profile is still used by knowledge bases")
    if not deleted:
        raise HTTPException(status_code=404, detail="Embedding profile not found")
    return {"ok": True}


@app.post("/knowledge-bases")
def create_knowledge_base(payload: KnowledgeBasePayload):
    try:
        return service.create_knowledge_base(**payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.patch("/knowledge-bases/{kb_id}")
def update_knowledge_base(kb_id: str, payload: KnowledgeBasePayload):
    try:
        record = service.update_knowledge_base(kb_id, **payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if record is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return record


@app.get("/knowledge-bases/{kb_id}/categories")
def list_categories(kb_id: str):
    return service.list_categories(kb_id)


@app.post("/knowledge-bases/{kb_id}/categories")
def create_category(kb_id: str, payload: CategoryPayload):
    try:
        return service.create_category(kb_id=kb_id, **payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/knowledge-bases/{kb_id}/files")
def list_files(kb_id: str):
    return service.list_files(kb_id)


@app.post("/knowledge-bases/{kb_id}/files")
async def upload_file(
    kb_id: str,
    file: UploadFile = File(...),
    category_id: Optional[str] = Form(default=None),
):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    try:
        file_record, job_record = service.upload_file(
            kb_id=kb_id,
            original_name=file.filename or "untitled",
            content=content,
            mime_type=file.content_type or "application/octet-stream",
            category_id=category_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"file": file_record, "job": job_record}


@app.get("/knowledge-bases/{kb_id}/files/{file_id}")
def get_file_detail(kb_id: str, file_id: str):
    try:
        result = service.get_file_detail(kb_id=kb_id, file_id=file_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=404, detail="File not found")
    file_record, content = result
    return {"file": file_record, "content": content}


@app.patch("/knowledge-bases/{kb_id}/files/{file_id}")
def update_file(kb_id: str, file_id: str, payload: FileUpdatePayload):
    try:
        file_record, job_record = service.update_file(
            kb_id=kb_id,
            file_id=file_id,
            original_name=payload.original_name,
            content=payload.content,
            category_id=payload.category_id,
            update_category="category_id" in payload.model_fields_set,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if file_record is None:
        raise HTTPException(status_code=404, detail="File not found")
    return {"file": file_record, "job": job_record}


@app.post("/knowledge-bases/{kb_id}/files/{file_id}/rewrite")
def rewrite_file(kb_id: str, file_id: str, payload: FileRewritePayload):
    try:
        result = service.rewrite_file(
            kb_id=kb_id,
            file_id=file_id,
            file_name=payload.file_name,
            content=payload.content,
            instruction=payload.instruction,
            history=[item.model_dump() for item in payload.history],
            selected_text=payload.selected_text,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"文档辅助对话失败：{exc}") from exc
    if result is None:
        raise HTTPException(status_code=404, detail="File not found")
    return {
        "reply": result.reply,
        "candidate_content": result.candidate_content,
    }


@app.delete("/knowledge-bases/{kb_id}/files/{file_id}")
def delete_file(kb_id: str, file_id: str):
    deleted = service.delete_file(kb_id=kb_id, file_id=file_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="File not found")
    return {"ok": True}


@app.get("/knowledge-bases/{kb_id}/jobs")
def list_jobs(kb_id: str):
    return service.list_jobs(kb_id)


@app.delete("/knowledge-bases/{kb_id}/jobs")
def clear_finished_jobs(kb_id: str):
    try:
        deleted_count = service.clear_finished_jobs(kb_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ok": True, "deleted_count": deleted_count}


@app.post("/knowledge-bases/{kb_id}/files/{file_id}/embed")
def reindex_file(kb_id: str, file_id: str):
    job = service.reindex_file(kb_id=kb_id, file_id=file_id)
    if job is None:
        raise HTTPException(status_code=404, detail="File not found")
    return job


@app.get("/knowledge-bases/{kb_id}/search")
def search(kb_id: str, q: str):
    return service.search(kb_id=kb_id, query=q)


@app.get("/chat/conversations")
def list_conversations():
    return conversation_service.list_conversations()


@app.post("/chat/conversations")
def create_conversation(payload: ConversationPayload):
    return conversation_service.create_conversation(
        title=payload.title,
        knowledge_base_id=payload.knowledge_base_id,
        agent_profile_id=payload.agent_profile_id,
        last_mode=payload.last_mode,
    )


@app.get("/chat/conversations/{conversation_id}")
def get_conversation(conversation_id: str):
    record = conversation_service.get_conversation(conversation_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return record


@app.patch("/chat/conversations/{conversation_id}")
def update_conversation(conversation_id: str, payload: ConversationUpdatePayload):
    values = payload.model_dump(exclude_unset=True)
    record = conversation_service.update_conversation(
        conversation_id,
        title=values["title"] if "title" in values else _UNSET,
        knowledge_base_id=values["knowledge_base_id"] if "knowledge_base_id" in values else _UNSET,
        agent_profile_id=values["agent_profile_id"] if "agent_profile_id" in values else _UNSET,
        last_mode=values["last_mode"] if "last_mode" in values else _UNSET,
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return record


@app.delete("/chat/conversations/{conversation_id}")
def delete_conversation(conversation_id: str):
    deleted = conversation_service.delete_conversation(conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"ok": True}


@app.get("/chat/conversations/{conversation_id}/messages")
def list_conversation_messages(conversation_id: str):
    record = conversation_service.get_conversation(conversation_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation_service.list_messages(conversation_id)
