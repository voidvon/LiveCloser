from __future__ import annotations

from pathlib import Path

from .chroma_store import ChromaStore
from .db import connect
from .embeddings import EmbeddingClient
from .repositories import KnowledgeBaseRepository


class RetrievalService:
    def __init__(self, *, db_path: Path, chroma_root: Path):
        self._db_path = db_path
        self._chroma_store = ChromaStore(root_dir=chroma_root)

    def search(
        self,
        *,
        kb_id: str,
        query: str,
        top_k: int | None = None,
    ) -> list[dict[str, object]]:
        with connect(self._db_path) as conn:
            repo = KnowledgeBaseRepository(conn)
            kb_record = repo.get_knowledge_base(kb_id)
            if kb_record is None:
                raise ValueError("知识库不存在")

            embedding_client = EmbeddingClient(
                provider=kb_record.embedding_provider,
                model=kb_record.embedding_model,
                base_url=kb_record.embedding_base_url,
                api_key_env=kb_record.embedding_api_key_env,
            )
            query_embedding = embedding_client.embed_texts([query])[0]
            result = self._chroma_store.search(
                kb_id=kb_id,
                query_embedding=query_embedding,
                top_k=top_k or kb_record.retrieval_top_k,
            )

        documents = result.get("documents", [[]])
        metadatas = result.get("metadatas", [[]])
        distances = result.get("distances", [[]])
        response: list[dict[str, object]] = []
        for document, metadata, distance in zip(
            documents[0] if documents else [],
            metadatas[0] if metadatas else [],
            distances[0] if distances else [],
        ):
            response.append(
                {
                    "content": document,
                    "metadata": metadata,
                    "distance": distance,
                }
            )
        return response

    def search_many(
        self,
        *,
        kb_ids: list[str],
        query: str,
        top_k: int,
    ) -> list[dict[str, object]]:
        merged: list[dict[str, object]] = []
        for kb_id in kb_ids:
            results = self.search(kb_id=kb_id, query=query, top_k=top_k)
            for result in results:
                metadata = dict(result.get("metadata") or {})
                metadata.setdefault("kb_id", kb_id)
                result["metadata"] = metadata
                merged.append(result)
        merged.sort(key=lambda item: float(item.get("distance") or 0))
        return merged[:top_k]
