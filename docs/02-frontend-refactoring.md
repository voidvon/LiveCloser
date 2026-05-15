# 前端架构优化指南

## 概述

前端基于 Next.js 15 (App Router) + React 19 + Tailwind CSS 4 构建。当前核心问题：页面级组件过于庞大、数据获取逻辑重复、缺少状态管理抽象层。

---

## 问题 1：HTTP 工具函数重复定义（P1）

### 现状

以下文件各自定义了几乎相同的 `getJson`、`postJson`、`patchJson`、`deleteJson` 函数：

| 文件 | 定义的函数 |
|------|-----------|
| `components/products/product-page-client.tsx:88` | `getJson`, `deleteJson` |
| `components/agents/agent-page-client.tsx:117` | `getJson`, `deleteJson` |
| `components/chat/chat-workspace.tsx:67` | `getJson`, `postJson`, `patchJson`, `deleteJson` |
| `components/settings/settings-page-client.tsx:207` | `getJson`, `postJson`, `deleteJson` |
| `components/kb/kb-page-client.tsx:155` | `getJson` |

### 重构方案

创建 `frontend/lib/api.ts`，统一封装：

```typescript
// frontend/lib/api.ts

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
  });
  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(response.status, text);
  }
  return response.json();
}

export async function getJson<T>(url: string): Promise<T> {
  return request<T>(url);
}

export async function postJson<T>(url: string, payload?: object): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  });
}

export async function patchJson<T>(url: string, payload: object): Promise<T> {
  return request<T>(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteJson(url: string): Promise<void> {
  const response = await fetch(url, { method: 'DELETE', cache: 'no-store' });
  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }
}
```

然后在各组件中替换为：

```typescript
import { getJson, postJson, patchJson, deleteJson } from '@/lib/api';
```

---

## 问题 2：巨型页面组件（P1）

### 现状

| 文件 | 行数 | useState 数量 |
|------|------|--------------|
| `components/kb/kb-page-client.tsx` | 2362 | 30+ |
| `components/chat/chat-workspace.tsx` | 800+ | 15+ |
| `components/products/product-page-client.tsx` | 640 | 10+ |
| `components/settings/settings-page-client.tsx` | — | 10+ |
| `components/agents/agent-page-client.tsx` | — | 10+ |

### 重构策略：提取自定义 Hooks

**原则**：将数据获取 + 状态管理逻辑提取到自定义 Hook 中，组件只负责 UI 渲染。

#### 示例：ProductPageClient 重构

**重构前**（`components/products/product-page-client.tsx`）：

```tsx
export function ProductPageClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  // ... 更多 state

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    const data = await getJson<Product[]>('/api/kb/products');
    setProducts(data);
    setLoading(false);
  }

  async function handleCreate(payload: ProductPayload) { ... }
  async function handleUpdate(id: string, payload: ProductPayload) { ... }
  async function handleDelete(id: string) { ... }

  return (/* 大量 JSX */);
}
```

**重构后**：

```tsx
// hooks/useProducts.ts
export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async (query = '') => {
    setLoading(true);
    const params = query ? `?query=${encodeURIComponent(query)}` : '';
    const data = await getJson<Product[]>(`/api/kb/products${params}`);
    setProducts(data);
    setLoading(false);
  }, []);

  const create = useCallback(async (payload: ProductPayload) => {
    const product = await postJson<Product>('/api/kb/products', payload);
    setProducts(prev => [product, ...prev]);
    return product;
  }, []);

  const update = useCallback(async (id: string, payload: ProductPayload) => {
    const product = await patchJson<Product>(`/api/kb/products/${id}`, payload);
    setProducts(prev => prev.map(p => p.id === id ? product : p));
    return product;
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteJson(`/api/kb/products/${id}`);
    setProducts(prev => prev.filter(p => p.id !== id));
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return { products, loading, fetch, create, update, remove };
}
```

```tsx
// components/products/product-page-client.tsx — 只负责 UI
export function ProductPageClient() {
  const { products, loading, fetch, create, update, remove } = useProducts();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  return (/* 纯 UI 渲染 */);
}
```

#### 建议提取的 Hooks

| Hook | 来源组件 | 职责 |
|------|---------|------|
| `useProducts()` | product-page-client | 产品 CRUD + 搜索 |
| `useKnowledgeBases()` | kb-page-client | KB 列表 + CRUD |
| `useKBFiles(kbId)` | kb-page-client | 文件列表 + 上传 + 编辑 |
| `useKBCategories(kbId)` | kb-page-client | 分类树 CRUD |
| `useConversations()` | chat-workspace | 会话列表 + CRUD |
| `useConversationMessages(id)` | chat-workspace | 消息列表 + 追加 |
| `useProfiles(type)` | settings-page-client | 各类 Profile CRUD |
| `useAgentProfiles()` | agent-page-client | 智能体配置 CRUD |

### 拆分大组件的内联子组件

`kb-page-client.tsx` 中定义了多个内联组件，应提取为独立文件：

```
components/kb/
├── kb-page-client.tsx              → 主页面（精简后 ~300 行）
├── kb-detail-view.tsx              → 知识库详情面板
├── kb-file-editor.tsx              → 文件编辑器
├── kb-category-tree.tsx            → 分类树组件
├── kb-file-list.tsx                → 文件列表
├── kb-rewrite-panel.tsx            → AI 改写面板
└── kb-create-dialog.tsx            → 创建对话框
```

---

## 问题 3：模块级缓存（P2）

### 现状

`components/chat/chat-workspace.tsx` 使用模块级变量做缓存：

```tsx
let conversationListCache: ConversationRecord[] | null = null;
let conversationMessageCacheStore: Record<string, ConversationMessageRecord[]> = {};
```

### 问题

- 模块级变量在 React 严格模式下不安全（组件卸载重挂载时缓存不清）
- 多标签页共享同一缓存，数据可能过期
- 没有失效策略

### 重构方案

**方案 A：使用 SWR（推荐）**

```bash
cd frontend && pnpm add swr
```

```tsx
// hooks/useConversations.ts
import useSWR from 'swr';
import { getJson } from '@/lib/api';

export function useConversations() {
  const { data, error, mutate } = useSWR<ConversationRecord[]>(
    '/api/chat/conversations',
    getJson,
    { revalidateOnFocus: false }
  );

  return {
    conversations: data ?? [],
    loading: !data && !error,
    error,
    refresh: mutate,
  };
}
```

**方案 B：使用 useRef 替代模块级变量（最小改动）**

```tsx
function ChatWorkspace() {
  const cacheRef = useRef<{
    conversations: ConversationRecord[] | null;
    messages: Record<string, ConversationMessageRecord[]>;
  }>({ conversations: null, messages: {} });

  // 使用 cacheRef.current 替代模块级变量
}
```

---

## 问题 4：API Proxy 代码重复（P2）

### 现状

`app/api/kb/[...path]/route.ts` 和 `app/api/chat/[...path]/route.ts` 几乎完全相同，唯一区别是 URL 前缀和 multipart 处理。

### 重构方案

提取通用 proxy 工具函数：

```typescript
// lib/proxy.ts
import { NextResponse } from 'next/server';

const KB_API_URL = process.env.KB_API_URL || 'http://127.0.0.1:8001';

export function createProxyHandler(pathPrefix: string, options?: { supportMultipart?: boolean }) {
  async function forward(request: Request, path: string[]) {
    const url = new URL(`${KB_API_URL}/${pathPrefix}${path.length ? '/' + path.join('/') : ''}`);
    const incomingUrl = new URL(request.url);
    incomingUrl.searchParams.forEach((value, key) => url.searchParams.set(key, value));

    const contentType = request.headers.get('content-type') || '';
    let body: BodyInit | undefined;

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      if (options?.supportMultipart && contentType.includes('multipart/form-data')) {
        body = await request.formData();
      } else {
        body = await request.text();
      }
    }

    const headers: HeadersInit | undefined =
      options?.supportMultipart && contentType.includes('multipart/form-data')
        ? undefined
        : { 'Content-Type': contentType || 'application/json' };

    const response = await fetch(url, {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
    });

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }

  function handler(method: string) {
    return async (request: Request, context: { params: Promise<{ path: string[] }> }) => {
      const { path } = await context.params;
      return forward(request, path);
    };
  }

  return {
    GET: handler('GET'),
    POST: handler('POST'),
    PATCH: handler('PATCH'),
    DELETE: handler('DELETE'),
  };
}
```

```typescript
// app/api/kb/[...path]/route.ts
import { createProxyHandler } from '@/lib/proxy';
export const { GET, POST, PATCH, DELETE } = createProxyHandler('', { supportMultipart: true });

// app/api/chat/[...path]/route.ts
import { createProxyHandler } from '@/lib/proxy';
export const { GET, POST, PATCH, DELETE } = createProxyHandler('chat');
```

---

## 问题 5：缺少类型定义集中管理

### 现状

各组件内部各自定义 TypeScript 接口，没有统一的类型文件。

### 重构方案

创建 `frontend/types/` 目录：

```
frontend/types/
├── product.ts          → Product, ProductPayload
├── knowledge-base.ts   → KnowledgeBase, FileRecord, CategoryRecord
├── conversation.ts     → ConversationRecord, ConversationMessageRecord
├── profile.ts          → ChatModelProfile, SttModelProfile, TtsModelProfile, AgentProfile
└── index.ts            → 统一导出
```

---

## 执行顺序建议

1. **第一阶段**：创建 `lib/api.ts`，替换所有重复的 HTTP 函数（影响面广但改动简单）
2. **第二阶段**：创建 `types/` 目录，集中类型定义
3. **第三阶段**：逐个提取自定义 Hooks（从最简单的 `useProducts` 开始）
4. **第四阶段**：拆分 `kb-page-client.tsx` 内联子组件
5. **第五阶段**：合并 API Proxy + 引入 SWR
