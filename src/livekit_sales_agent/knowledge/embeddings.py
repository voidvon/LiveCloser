from __future__ import annotations

import httpx


class EmbeddingClient:
    def __init__(self, *, provider: str, model: str, base_url: str, api_key_env: str):
        self._provider = provider
        self._model = model
        self._base_url = base_url.rstrip("/")
        self._api_key_env = api_key_env

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        if self._provider != "openai_compatible":
            raise ValueError(f"暂不支持的 embedding provider: {self._provider}")
        if not self._model:
            raise ValueError("当前知识库未配置 embedding 模型")
        if not self._base_url:
            raise ValueError("当前知识库未配置 embedding base URL")
        if not self._api_key_env:
            raise ValueError("当前知识库未配置 embedding API key 环境变量名")

        api_key = self._api_key_env.strip()
        if not api_key:
            raise ValueError("当前知识库未配置 embedding API Key")

        response = httpx.post(
            f"{self._base_url}/embeddings",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": self._model, "input": texts},
            timeout=60,
        )
        response.raise_for_status()
        payload = response.json()
        data = payload.get("data")
        if not isinstance(data, list):
            raise ValueError("embedding 响应格式不正确")

        vectors: list[list[float]] = []
        for item in data:
            embedding = item.get("embedding") if isinstance(item, dict) else None
            if not isinstance(embedding, list):
                raise ValueError("embedding 响应缺少向量字段")
            vectors.append([float(value) for value in embedding])
        return vectors
