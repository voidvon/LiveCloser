# 数据层架构优化指南

## 概述

数据层当前由一个巨型 Repository（1400+ 行）承载所有实体的数据访问，配合 SQLite 单文件数据库和 ChromaDB 向量存储。核心问题：职责过于集中、缺少事务管理、并发访问不安全。

---

## 问题 1：KnowledgeBaseRepository 上帝对象（P1）

### 现状

`src/livekit_sales_agent/knowledge/repositories.py`（1400+ 行）管理了 10+ 种实体：

| 实体 | 方法 | 职责 |
|------|------|------|
| Product | `list_products`, `get_product`, `create_product`, `update_product`, `delete_product` | 产品目录 |
| ChatModelProfile | `list_chat_model_profiles`, `get_chat_model_profile`, `get_default_chat_model_profile`, `create_chat_model_profile`, `update_chat_model_profile`, `set_default_chat_model_profile`, `delete_chat_model_profile` | 对话模型 |
| AgentProfile | `list_agent_profiles`, `get_agent_profile`, `get_default_agent_profile`, `create_agent_profile`, `update_agent_profile`, `delete_agent_profile` | 智能体 |
| SttModelProfile | `list_stt_model_profiles`, `get_stt_model_profile`, `get_default_stt_model_profile`, `create_stt_model_profile`, `update_stt_model_profile`, `set_default_stt_model_profile`, `delete_stt_model_profile` | STT |
| TtsModelProfile | 同上模式 | TTS |
| EmbeddingProfile | 同上模式 | 嵌入模型 |
| KnowledgeBase | `list_knowledge_bases`, `get_knowledge_base`, `create_knowledge_base`, `update_knowledge_base` | 知识库 |
| Category | `list_categories`, `get_category`, `create_category`, `update_category`, `delete_category` | 分类 |
| File | `list_files`, `get_file`, `create_file`, `update_file`, `delete_file` | 文件 |
| Chunk | `create_chunk`, `delete_chunks_by_file` | 文本块 |
| Job | `create_job`, `get_job`, `update_job_status`, `list_pending_jobs` | 异步任务 |

### 目标结构

```
src/livekit_sales_agent/
├── knowledge/
│   ├── repositories.py     → 仅保留 KB、Category、File、Chunk、Job
│   └── ...
├── products/
│   └── repository.py       → ProductRepository
└── profiles/
    └── repository.py       → ProfileRepository（所有 Profile 类型）
```

### 重构步骤

**Step 1：提取 ProductRepository**

```python
# src/livekit_sales_agent/products/repository.py
import sqlite3
from typing import Optional
from ..knowledge.models import ProductRecord
from ..knowledge.repositories import _row_to_product, utc_now

class ProductRepository:
    def __init__(self, conn: sqlite3.Connection):
        self._conn = conn

    def list_products(self, *, query="", category="", brand="", model="", sku="", status="", limit=200) -> list[ProductRecord]:
        # 从 KnowledgeBaseRepository.list_products 迁移
        ...

    def get_product(self, product_id: str) -> Optional[ProductRecord]:
        ...

    def create_product(self, *, name, category, brand, model, sku, aliases, price, currency, status, summary, tags, attributes) -> ProductRecord:
        ...

    def update_product(self, product_id, *, name, category, brand, model, sku, aliases, price, currency, status, summary, tags, attributes) -> Optional[ProductRecord]:
        ...

    def delete_product(self, product_id: str) -> bool:
        ...
```

**Step 2：提取 ProfileRepository**

```python
# src/livekit_sales_agent/profiles/repository.py
import sqlite3
from typing import Optional

class ProfileRepository:
    """统一管理所有 Profile 类型的数据访问"""

    def __init__(self, conn: sqlite3.Connection):
        self._conn = conn

    # --- Chat Model ---
    def list_chat_model_profiles(self) -> list[ChatModelProfileRecord]: ...
    def get_chat_model_profile(self, profile_id: str) -> Optional[ChatModelProfileRecord]: ...
    def get_default_chat_model_profile(self) -> Optional[ChatModelProfileRecord]: ...
    def create_chat_model_profile(self, **kwargs) -> ChatModelProfileRecord: ...
    def update_chat_model_profile(self, profile_id, **kwargs) -> Optional[ChatModelProfileRecord]: ...
    def set_default_chat_model_profile(self, profile_id) -> Optional[ChatModelProfileRecord]: ...
    def delete_chat_model_profile(self, profile_id) -> bool: ...

    # --- Agent Profile ---
    def list_agent_profiles(self) -> list[AgentProfileRecord]: ...
    def get_agent_profile(self, profile_id) -> Optional[AgentProfileRecord]: ...
    def get_default_agent_profile(self) -> Optional[AgentProfileRecord]: ...
    def create_agent_profile(self, **kwargs) -> AgentProfileRecord: ...
    def update_agent_profile(self, profile_id, **kwargs) -> Optional[AgentProfileRecord]: ...
    def delete_agent_profile(self, profile_id) -> bool: ...

    # --- STT / TTS / Embedding ---
    # 同上模式...
```

**Step 3：精简 KnowledgeBaseRepository**

保留与知识库核心相关的方法：
- `list_knowledge_bases` / `get_knowledge_base` / `create_knowledge_base` / `update_knowledge_base`
- `list_categories` / `get_category` / `create_category` / `update_category` / `delete_category`
- `list_files` / `get_file` / `create_file` / `update_file` / `delete_file`
- `create_chunk` / `delete_chunks_by_file`
- `create_job` / `get_job` / `update_job_status` / `list_pending_jobs`

---

## 问题 2：连接管理模式（P2）

### 现状

每个 Service 方法独立创建连接：

```python
# service.py 中的典型模式
def list_products(self, ...):
    with connect(self._db_path) as conn:       # 每次方法调用都新建连接
        repo = KnowledgeBaseRepository(conn)    # 每次都实例化 Repository
        return repo.list_products(...)
```

### 问题

1. 无法在一个事务中执行多步操作（如"检查重复 → 创建产品"）
2. 频繁创建/销毁连接（虽然 SQLite 连接轻量，但仍有开销）
3. 无法实现跨方法的事务一致性

### 重构方案：引入 Unit of Work 模式

```python
# src/livekit_sales_agent/knowledge/db.py — 新增

from contextlib import contextmanager

@contextmanager
def unit_of_work(db_path: Path):
    """提供一个事务范围内的连接，自动 commit 或 rollback"""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

Service 层使用：

```python
class ProductService:
    def create_product(self, *, name, model, sku, ...):
        with unit_of_work(self._db_path) as conn:
            repo = ProductRepository(conn)
            # 验证和创建在同一个事务中
            if model and repo.list_products(model=model, limit=1):
                raise ValueError("产品型号不能重复")
            if sku and repo.list_products(sku=sku, limit=1):
                raise ValueError("产品货号不能重复")
            return repo.create_product(name=name, model=model, sku=sku, ...)
```

**注意**：Repository 层不再自行 `commit()`，由 Unit of Work 统一管理。

---

## 问题 3：SQLite 并发安全（P2）

### 现状

- Agent 进程和 KB Service 进程同时写同一个 SQLite 文件
- `db.py` 中使用 `check_same_thread=False`
- 没有启用 WAL 模式（Write-Ahead Logging）

### 风险

- 多进程写入时可能出现 `database is locked` 错误
- 默认 journal 模式下，写操作会阻塞读操作

### 短期修复：启用 WAL 模式

在 `src/livekit_sales_agent/knowledge/db.py` 的 `connect()` 函数中添加：

```python
def connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")       # 允许并发读写
    conn.execute("PRAGMA busy_timeout=5000")      # 等待锁最多 5 秒
    conn.execute("PRAGMA foreign_keys=ON")
    return conn
```

### 长期方案：统一数据访问入口

配合"后端优化指南"中的 P0 方案，Agent 进程不再直连数据库，所有写操作通过 KB Service 的 HTTP API 进行，从根本上消除多进程并发写的问题。

---

## 问题 4：Schema 迁移管理（P3）

### 现状

`src/livekit_sales_agent/knowledge/db.py` 中的 `ensure_database()` 函数同时负责：
- 创建数据库连接
- 执行建表语句（`schema.py`）
- 执行增量迁移（ALTER TABLE 等）

迁移逻辑是手动的 `try/except` 块：

```python
# 典型的迁移模式
try:
    conn.execute("ALTER TABLE xxx ADD COLUMN yyy TEXT DEFAULT ''")
except sqlite3.OperationalError:
    pass  # 列已存在则忽略
```

### 问题

- 没有版本号追踪，无法知道当前数据库处于哪个迁移版本
- 无法回滚迁移
- 新增迁移时容易遗漏

### 建议方案：版本化迁移

```python
# src/livekit_sales_agent/knowledge/db.py

MIGRATIONS = [
    # (version, description, sql)
    (1, "initial schema", SCHEMA_SQL),
    (2, "add products table", "CREATE TABLE IF NOT EXISTS products (...)"),
    (3, "add agent_profiles.idle_timeout_seconds", "ALTER TABLE agent_profiles ADD COLUMN idle_timeout_seconds REAL DEFAULT 10.0"),
    # ...
]

def ensure_database(db_path: Path):
    conn = sqlite3.connect(str(db_path))
    conn.execute("CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT)")

    applied = {row[0] for row in conn.execute("SELECT version FROM _migrations").fetchall()}

    for version, description, sql in MIGRATIONS:
        if version not in applied:
            conn.executescript(sql)
            conn.execute(
                "INSERT INTO _migrations (version, applied_at) VALUES (?, ?)",
                (version, utc_now()),
            )
            conn.commit()

    conn.close()
```

---

## 问题 5：models.py 数据模型改进（P3）

### 现状

所有数据模型使用 `@dataclass`，字段类型较松散：

```python
@dataclass
class ProductRecord:
    id: str
    name: str
    category: str
    brand: str
    model: str
    sku: str
    aliases: str
    price: str          # 价格用 str 存储
    currency: str
    status: str         # 没有枚举约束
    summary: str
    tags: str           # JSON 字符串
    attributes: str     # JSON 字符串
    created_at: str     # 时间用 str 存储
    updated_at: str
```

### 建议改进

1. **价格字段**：保持 `str` 但添加格式说明注释（因为需要支持"面议"等非数字值）
2. **状态字段**：使用 Literal 类型约束

```python
from typing import Literal

ProductStatus = Literal["active", "inactive", "discontinued"]

@dataclass
class ProductRecord:
    id: str
    name: str
    status: ProductStatus
    # ...
```

3. **JSON 字段**：提供序列化/反序列化辅助方法

```python
@dataclass
class ProductRecord:
    tags: str  # JSON array string

    @property
    def tags_list(self) -> list[str]:
        import json
        return json.loads(self.tags) if self.tags else []
```

---

## 问题 6：ChromaDB 集成耦合（P3）

### 现状

`ChromaStore` 在 `KnowledgeService.__init__` 中创建，与 SQLite 操作混在同一个 Service 中。

### 建议

将向量检索相关逻辑保持在独立的 `RetrievalService` 中（当前已经是独立的），但确保：
- `KnowledgeService` 不直接操作 ChromaDB
- 文件索引时通过 `JobRunner` 间接写入 ChromaDB
- 检索时通过 `RetrievalService` 读取

当前架构在这一点上已经基本合理，只需确保不引入新的耦合。

---

## 执行顺序建议

1. **第一阶段**：启用 WAL 模式 + busy_timeout（一行代码修复，立即生效）
2. **第二阶段**：提取 ProductRepository 和 ProfileRepository
3. **第三阶段**：引入 Unit of Work 模式，Repository 不再自行 commit
4. **第四阶段**：实现版本化迁移
5. **第五阶段**：数据模型类型增强

---

## 附录：当前数据库表结构

来自 `src/livekit_sales_agent/knowledge/schema.py`：

| 表名 | 用途 |
|------|------|
| `knowledge_bases` | 知识库元数据 |
| `categories` | 知识库内的文档分类 |
| `files` | 上传的文档记录 |
| `chunks` | 文档分块（用于向量索引） |
| `jobs` | 异步索引任务队列 |
| `products` | 产品目录 |
| `chat_model_profiles` | LLM 对话模型配置 |
| `agent_profiles` | 智能体行为配置 |
| `stt_model_profiles` | 语音识别模型配置 |
| `tts_model_profiles` | 语音合成模型配置 |
| `embedding_profiles` | 嵌入模型配置 |
| `conversations` | 会话记录 |
| `conversation_messages` | 会话消息 |
