from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from livekit_sales_agent.conversation import ConversationService
from livekit_sales_agent.conversation.service import _UNSET
from livekit_sales_agent.knowledge import KnowledgeService, ensure_database


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
    embedding_provider: str = "openai_compatible"
    embedding_model: str = ""
    embedding_base_url: str = ""
    embedding_api_key_env: str = ""
    chunk_size: int = 800
    chunk_overlap: int = 120
    retrieval_top_k: int = 5


class CategoryPayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    parent_id: Optional[str] = None
    sort_order: int = 0


class ConversationPayload(BaseModel):
    title: str = "新会话"
    knowledge_base_id: Optional[str] = None
    last_mode: str = "text"


class ConversationUpdatePayload(BaseModel):
    title: Optional[str] = None
    knowledge_base_id: Optional[str] = None
    last_mode: Optional[str] = None


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/knowledge-bases")
def list_knowledge_bases():
    return service.list_knowledge_bases()


@app.post("/knowledge-bases")
def create_knowledge_base(payload: KnowledgeBasePayload):
    return service.create_knowledge_base(**payload.model_dump())


@app.patch("/knowledge-bases/{kb_id}")
def update_knowledge_base(kb_id: str, payload: KnowledgeBasePayload):
    record = service.update_knowledge_base(kb_id, **payload.model_dump())
    if record is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return record


@app.get("/knowledge-bases/{kb_id}/categories")
def list_categories(kb_id: str):
    return service.list_categories(kb_id)


@app.post("/knowledge-bases/{kb_id}/categories")
def create_category(kb_id: str, payload: CategoryPayload):
    return service.create_category(kb_id=kb_id, **payload.model_dump())


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
    file_record, job_record = service.upload_file(
        kb_id=kb_id,
        original_name=file.filename or "untitled",
        content=content,
        mime_type=file.content_type or "application/octet-stream",
        category_id=category_id,
    )
    return {"file": file_record, "job": job_record}


@app.delete("/knowledge-bases/{kb_id}/files/{file_id}")
def delete_file(kb_id: str, file_id: str):
    del kb_id
    deleted = service.delete_file(file_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="File not found")
    return {"ok": True}


@app.get("/knowledge-bases/{kb_id}/jobs")
def list_jobs(kb_id: str):
    return service.list_jobs(kb_id)


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
        last_mode=values["last_mode"] if "last_mode" in values else _UNSET,
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return record


@app.get("/chat/conversations/{conversation_id}/messages")
def list_conversation_messages(conversation_id: str):
    record = conversation_service.get_conversation(conversation_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation_service.list_messages(conversation_id)
