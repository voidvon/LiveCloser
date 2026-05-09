from __future__ import annotations

from pathlib import Path
from typing import Any

import chromadb
from chromadb.api.models.Collection import Collection

from .models import ChunkDocument


class ChromaStore:
    def __init__(self, *, root_dir: Path):
        self._root_dir = root_dir
        self._root_dir.mkdir(parents=True, exist_ok=True)

    def _client(self, kb_id: str):
        return chromadb.PersistentClient(path=str(self._root_dir / kb_id))

    def _collection(self, kb_id: str) -> Collection:
        client = self._client(kb_id)
        return client.get_or_create_collection(name="documents")

    def replace_file_chunks(
        self,
        *,
        kb_id: str,
        file_id: str,
        chunks: list[ChunkDocument],
        embeddings: list[list[float]],
    ) -> None:
        collection = self._collection(kb_id)
        self.delete_file_chunks(kb_id=kb_id, file_id=file_id)
        if not chunks:
            return
        collection.add(
            ids=[chunk.chunk_id for chunk in chunks],
            documents=[chunk.content for chunk in chunks],
            embeddings=embeddings,
            metadatas=[_metadata_for_chunk(chunk) for chunk in chunks],
        )

    def delete_file_chunks(self, *, kb_id: str, file_id: str) -> None:
        collection = self._collection(kb_id)
        collection.delete(where={"file_id": file_id})

    def search(self, *, kb_id: str, query_embedding: list[float], top_k: int) -> dict[str, Any]:
        collection = self._collection(kb_id)
        return collection.query(query_embeddings=[query_embedding], n_results=top_k)


def _metadata_for_chunk(chunk: ChunkDocument) -> dict[str, str]:
    metadata = {
        "kb_id": chunk.kb_id,
        "file_id": chunk.file_id,
        "source_path": chunk.source_path,
        "title": chunk.title,
        "chunk_index": str(chunk.chunk_index),
    }
    if chunk.category_id:
        metadata["category_id"] = chunk.category_id
    return metadata
