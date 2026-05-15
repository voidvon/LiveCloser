# 后端架构优化指南

## 概述

后端由两个进程组成：
- **Agent 进程** (`src/agent.py`) — LiveKit 语音/文本智能体
- **KB Service 进程** (`src/kb_server.py`) — FastAPI REST 服务

当前核心问题：两个进程各自直连同一个 SQLite 数据库，且业务逻辑集中在少数几个巨型文件中。

---

## 问题 1：Agent 直连数据库（P0）

### 现状

`src/agent.py` 模块级别直接创建服务实例：

```python
# src/agent.py:44-55
settings = Settings.from_env()
ensure_database(settings.kb_data_dir / "app.db")
retrieval_service = RetrievalService(db_path=..., chroma_root=...)
knowledge_service = KnowledgeService(db_path=..., files_root=..., chroma_root=...)
conversation_service = ConversationService(db_path=...)
```

同时 `src/kb_server.py:30-32` 也创建了相同的服务实例操作同一个数据库。

### 问题

1. 两个进程并发写同一个 SQLite 文件，存在锁竞争
2. 无法独立部署 — Agent 必须和数据库在同一台机器
3. 数据一致性无保障 — 没有统一的事务边界
4. 测试困难 — 无法 mock 数据访问

### 目标架构

```
Agent 进程                          KB Service 进程
    │                                    │
    │── HTTP ──► /products/search        │── 直连 ──► SQLite
    │── HTTP ──► /knowledge-bases/search │── 直连 ──► ChromaDB
    │── HTTP ──► /chat/conversations     │
```

### 重构步骤

**Step 1：定义 Agent 端的 HTTP Client 接口**

创建 `src/livekit_sales_agent/kb_client.py`：

```python
"""Agent 通过 HTTP 访问 KB Service 的客户端封装"""
import httpx
from dataclasses import dataclass
from typing import Optional


@dataclass
class KBClient:
    base_url: str = "http://127.0.0.1:8001"

    async def search_products(
        self, *, query: str = "", category: str = "", brand: str = "",
        model: str = "", sku: str = "", limit: int = 200,
    ) -> list[dict]:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{self.base_url}/products", params={
                "query": query, "category": category, "brand": brand,
                "model": model, "sku": sku, "limit": limit,
            })
            resp.raise_for_status()
            return resp.json()

    async def search_knowledge_base(self, *, query: str, kb_ids: list[str], top_k: int) -> list[dict]:
        async with httpx.AsyncClient() as client:
            resp = await client.post(f"{self.base_url}/retrieval/search", json={
                "query": query, "knowledge_base_ids": kb_ids, "top_k": top_k,
            })
            resp.raise_for_status()
            return resp.json()

    async def append_message(self, conversation_id: str, *, role: str, content: str) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base_url}/chat/conversations/{conversation_id}/messages",
                json={"role": role, "content": content},
            )
            resp.raise_for_status()
            return resp.json()
```

**Step 2：KB Service 补充缺失的 API 端点**

当前 `kb_server.py` 缺少 Agent 需要的检索端点，需要新增：

```python
# src/kb_server.py — 新增端点

class RetrievalSearchPayload(BaseModel):
    query: str
    knowledge_base_ids: list[str]
    top_k: int = 5

@app.post("/retrieval/search")
def retrieval_search(payload: RetrievalSearchPayload):
    results = service.search(
        query=payload.query,
        knowledge_base_ids=payload.knowledge_base_ids,
        top_k=payload.top_k,
    )
    return results
```

**Step 3：替换 Agent 中的直连调用**

将 `agent.py` 中所有 `knowledge_service.xxx()` 和 `retrieval_service.xxx()` 调用替换为 `kb_client.xxx()`。

**Step 4：移除 Agent 对数据库的直接依赖**

删除 `agent.py` 中的：
- `from livekit_sales_agent.knowledge.db import ensure_database`
- `from livekit_sales_agent.knowledge.retrieval import RetrievalService`
- `from livekit_sales_agent.knowledge.service import KnowledgeService`
- 模块级别的 `ensure_database()`、`retrieval_service`、`knowledge_service` 实例化

---

## 问题 2：KnowledgeService 上帝对象（P1）

### 现状

`src/livekit_sales_agent/knowledge/service.py`（964 行）承担了所有业务逻辑：

| 方法组 | 行数范围 | 职责 |
|--------|----------|------|
| `list_products` / `create_product` / `update_product` / `delete_product` | 41-160 | 产品目录 |
| `list_chat_model_profiles` / `create_chat_model_profile` / ... | 199-396 | 对话模型配置 |
| `list_stt_model_profiles` / `create_stt_model_profile` / ... | 398-479 | STT 配置 |
| `list_tts_model_profiles` / `create_tts_model_profile` / ... | 480-560 | TTS 配置 |
| `list_agent_profiles` / `create_agent_profile` / ... | 204-342 | 智能体配置 |
| `list_embedding_profiles` / `create_embedding_profile` / ... | — | 嵌入模型配置 |
| `create_knowledge_base` / `upload_file` / `rewrite_file` / ... | — | 知识库管理 |

### 目标结构

```
src/livekit_sales_agent/
├── knowledge/
│   ├── service.py          → 仅保留知识库核心逻辑（KB CRUD、文件、分类、检索）
│   └── ...
├── products/
│   ├── service.py          → ProductService（产品 CRUD + 验证）
│   └── repository.py       → ProductRepository（SQL 查询）
├── profiles/
│   ├── service.py          → ProfileService（所有 Profile 类型的 CRUD）
│   └── repository.py       → ProfileRepository
└── conversation/
    ├── service.py          → 保持不变
    └── repositories.py     → 保持不变
```

### 重构步骤

**Step 1：提取 ProductService**

从 `service.py` 中提取产品相关方法到 `src/livekit_sales_agent/products/service.py`：

```python
class ProductService:
    def __init__(self, *, db_path: Path):
        self._db_path = db_path

    def list_products(self, *, query="", category="", brand="", model="", sku="", status="", limit=200):
        ...

    def create_product(self, *, name, category, brand, model, sku, aliases, price, currency, status, summary, tags, attributes):
        ...

    def update_product(self, product_id, *, name, category, brand, model, sku, aliases, price, currency, status, summary, tags, attributes):
        ...

    def delete_product(self, product_id) -> bool:
        ...
```

**Step 2：提取 ProfileService**

从 `service.py` 中提取所有 Profile 相关方法（chat_model、stt、tts、embedding、agent）到 `src/livekit_sales_agent/profiles/service.py`。

**Step 3：更新 kb_server.py 的依赖**

```python
# 重构前
service = KnowledgeService(db_path=DB_PATH, files_root=FILES_ROOT, chroma_root=CHROMA_ROOT)

# 重构后
from livekit_sales_agent.products.service import ProductService
from livekit_sales_agent.profiles.service import ProfileService

kb_service = KnowledgeService(db_path=DB_PATH, files_root=FILES_ROOT, chroma_root=CHROMA_ROOT)
product_service = ProductService(db_path=DB_PATH)
profile_service = ProfileService(db_path=DB_PATH)
```

---

## 问题 3：config.py 反向依赖 Repository（P2）

### 现状

`src/livekit_sales_agent/config.py:15-16` 直接导入了数据层：

```python
from livekit_sales_agent.knowledge.db import connect
from livekit_sales_agent.knowledge.repositories import KnowledgeBaseRepository
```

`load_chat_model_settings()`、`load_agent_profile_settings()`、`load_stt_model_settings()` 等函数直接操作数据库。

### 问题

配置层（config）依赖了持久化层（knowledge.repositories），方向反了。正确的依赖方向应该是：

```
config ← service ← repository ← db
```

### 重构方案

将 `load_*` 函数移到 `ProfileService` 中，`config.py` 只保留纯数据类定义：

```python
# config.py — 只保留 dataclass 定义
@dataclass
class Settings: ...

@dataclass
class ChatModelSettings: ...

@dataclass
class SttModelSettings: ...

@dataclass
class TtsModelSettings: ...

@dataclass
class AgentProfileSettings: ...
```

```python
# profiles/service.py — 承接 load 逻辑
class ProfileService:
    def load_chat_model_settings(self) -> ChatModelSettings: ...
    def load_agent_profile_settings(self, *, agent_profile_id, default_retrieval_top_k) -> AgentProfileSettings: ...
    def load_stt_model_settings(self, *, profile_id=None) -> Optional[SttModelSettings]: ...
    def load_tts_model_settings(self, *, profile_id=None) -> Optional[TtsModelSettings]: ...
```

---

## 问题 4：kb_server.py 混合关注点（P2）

### 现状

`src/kb_server.py`（600+ 行）混合了：
- 13 个 Pydantic 模型定义（45-178 行）
- 30+ 个路由处理函数
- 服务实例化和中间件配置

### 重构方案

```
src/
├── kb_server.py              → 仅保留 app 创建、中间件、路由注册
├── kb_server_schemas.py      → 所有 Pydantic Payload 模型
└── kb_server_routes/
    ├── products.py           → 产品相关路由
    ├── profiles.py           → 所有 Profile 路由
    ├── knowledge_bases.py    → KB + 文件 + 分类路由
    └── conversations.py      → 会话路由
```

或者更简单的方案 — 使用 FastAPI Router：

```python
# src/kb_server.py
from fastapi import FastAPI
from .routes.products import router as products_router
from .routes.profiles import router as profiles_router
from .routes.knowledge_bases import router as kb_router
from .routes.conversations import router as conversations_router

app = FastAPI(title="Knowledge Base Service", version="0.1.0")
app.include_router(products_router)
app.include_router(profiles_router)
app.include_router(kb_router)
app.include_router(conversations_router)
```

---

## 问题 5：错误处理不一致

### 现状

- `service.py` 中用 `ValueError` 表示业务错误
- `kb_server.py` 中只捕获 `ValueError`，其他异常直接 500
- 没有统一的错误响应格式
- 部分方法返回 `None` 表示"未找到"，部分抛异常

### 建议

定义统一的业务异常：

```python
# src/livekit_sales_agent/exceptions.py
class NotFoundError(Exception):
    pass

class ValidationError(Exception):
    pass

class ConflictError(Exception):
    pass
```

在 `kb_server.py` 中注册全局异常处理器：

```python
@app.exception_handler(NotFoundError)
async def not_found_handler(request, exc):
    return JSONResponse(status_code=404, content={"detail": str(exc)})

@app.exception_handler(ValidationError)
async def validation_handler(request, exc):
    return JSONResponse(status_code=400, content={"detail": str(exc)})
```

---

## 执行顺序建议

1. **第一阶段**：提取 ProductService 和 ProfileService（不改变外部行为）
2. **第二阶段**：KB Service 补充检索 API 端点
3. **第三阶段**：Agent 切换为 HTTP Client 访问
4. **第四阶段**：整理 config.py 依赖方向
5. **第五阶段**：拆分 kb_server.py 路由
