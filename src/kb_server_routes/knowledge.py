from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from kb_server_schemas import (
    CategoryPayload,
    FileRewritePayload,
    FileUpdatePayload,
    KnowledgeBasePayload,
    RetrievalSearchPayload,
)
from livekit_sales_agent.knowledge.service import KnowledgeService


def register_knowledge_routes(app: FastAPI, *, service: KnowledgeService) -> None:
    @app.get("/knowledge-bases")
    def list_knowledge_bases():
        return service.list_knowledge_bases()

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

    @app.post("/retrieval/search")
    def retrieval_search(payload: RetrievalSearchPayload):
        knowledge_base_ids = [
            kb_id.strip() for kb_id in payload.knowledge_base_ids if kb_id.strip()
        ]
        if not knowledge_base_ids:
            return []
        if len(knowledge_base_ids) == 1:
            return service.search(
                kb_id=knowledge_base_ids[0],
                query=payload.query,
                top_k=payload.top_k,
            )
        return service.search_many(
            knowledge_base_ids=knowledge_base_ids,
            query=payload.query,
            top_k=payload.top_k,
        )
