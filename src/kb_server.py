from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from kb_server_routes import (
    register_chat_routes,
    register_knowledge_routes,
    register_product_routes,
    register_profile_routes,
    register_runtime_routes,
)
from livekit_sales_agent.conversation import ConversationService
from livekit_sales_agent.knowledge.db import ensure_database
from livekit_sales_agent.knowledge.service import KnowledgeService
from livekit_sales_agent.profiles import ProfileService
from livekit_sales_agent.products import ProductService


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
profile_service = ProfileService(db_path=DB_PATH)
product_service = ProductService(db_path=DB_PATH)
service.resume_pending_jobs()

app = FastAPI(title="Knowledge Base Service", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True}

register_runtime_routes(app, profile_service=profile_service)
register_product_routes(app, product_service=product_service)
register_profile_routes(app, profile_service=profile_service)
register_knowledge_routes(app, service=service)
register_chat_routes(app, conversation_service=conversation_service)
