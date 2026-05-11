# LiveKit Sales Agent MVP

这是一个最小可用的销售 Agent 项目，开发时通常会跑三部分：

- LiveKit Server
- Python 后端：`LiveKit Agents` + OpenAI 兼容 LLM + 本地知识库
- Python 知识库服务：管理多知识库、文件上传和索引任务
- Next.js 前端：用于发起会话、展示对话和语音交互界面

## 项目结构

```text
livekit-sales-agent-mvp/
├── frontend/          # Next.js 前端
├── knowledge/         # 旧的本地 Markdown / JSON 知识目录
├── .data/             # 运行时数据（SQLite / 上传文件 / Chroma）
├── scripts/
│   └── dev.sh         # 统一开发启动脚本
├── src/
│   ├── agent.py
│   ├── kb_server.py
│   └── livekit_sales_agent/
└── tests/
```

## 依赖要求

- Python `3.10+`，推荐 `3.11`
- `uv`
- Node.js `18+`
- `npm`
- `livekit-server`

说明：

- 根目录 `.env` 给后端 Agent 使用
- `frontend/.env.local` 给前端使用
- 知识库服务默认使用 `KB_DATA_DIR=.data/kb`
- 如果两个文件里的 `LIVEKIT_URL` 指向同一个 LiveKit 实例，前后端才能正常联通
- 如果 `LIVEKIT_URL=ws://127.0.0.1:7880` 或 `ws://localhost:7880`，`dev.sh` 会自动启动本地 LiveKit Server

## 环境变量

首次使用至少准备这几个变量。

后端 `.env`：

```bash
cp .env.example .env
```

必填项：

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

对话、STT、TTS 模型都改为在设置页写入数据库，不再从后端 `.env` 读取。

前端 `.env.local`：

```bash
cp frontend/.env.example frontend/.env.local
```

必填项：

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `DISPATCH_AGENT_NAME` 或让前端保持默认派发逻辑
- `KB_API_URL` 默认可保留 `http://127.0.0.1:8001`

如果只验证文字模式，不需要额外配置模型；如果要启用对话或语音，先启动前后端，再去 `/settings` 添加默认模型。

## 开发启动

推荐直接使用统一脚本：

```bash
./scripts/dev.sh
```

它会：

- 如果 `LIVEKIT_URL` 指向本地地址，自动启动 `livekit-server`
- 后台启动 Python 知识库服务（开发态带 `--reload` 热更新）
- 后台启动 Python Agent
- 前台启动 Next.js 开发服务器

默认前端地址：

```text
http://localhost:3000
```

如果 `.env` 里的 `LIVEKIT_URL` 是远程地址，脚本不会尝试在本地启动 LiveKit，而是直接连接你配置的远程实例。

### 分开启动

只启动后端：

```bash
./scripts/dev.sh backend
```

只启动前端：

```bash
./scripts/dev.sh frontend
```

只启动知识库服务：

```bash
./scripts/dev.sh kb
```

只启动本地 LiveKit：

```bash
./scripts/dev.sh livekit
```

只跑文字控制台：

```bash
./scripts/dev.sh console
```

## 不用脚本时的原始命令

LiveKit：

```bash
LIVEKIT_KEYS='devkey: secret' livekit-server --dev --bind 127.0.0.1
```

后端：

```bash
UV_CACHE_DIR=.uv-cache uv run python src/agent.py dev
```

知识库服务：

```bash
UV_CACHE_DIR=.uv-cache uv run uvicorn src.kb_server:app --host 127.0.0.1 --port 8001 --reload
```

前端：

```bash
cd frontend
npm run dev
```

文字模式自检：

```bash
UV_CACHE_DIR=.uv-cache uv run python src/agent.py console --text
```

## 常见问题

### 1. `dev.sh` 为什么之前没有包含 LiveKit？

现在已经包含了。只要根目录 `.env` 里的 `LIVEKIT_URL` 是本地地址，脚本会自动检查并启动 `livekit-server`。

### 2. 后端看起来启动了，但一直重试

如果日志里出现类似错误：

```text
Cannot connect to host 127.0.0.1:7880
```

这通常不是 Agent 代码没启动，而是 `LIVEKIT_URL` 指向的 LiveKit Server 没有启动。

### 3. 前端能开，但点击开始时报 500

这通常也是因为前端在调用 LiveKit 或 Agent dispatch 时，`LIVEKIT_URL` 对应的服务不可达。

### 4. 什么时候不需要 STT / TTS？

如果你只想先验证知识库问答和 LLM 流程，可以先用：

```bash
./scripts/dev.sh console
```

这条命令不依赖语音输入输出。

## 当前约束

- 价格信息来自本地知识库，不是实时价格
- Prompt 已要求回答价格时带上 `更新时间`
- 如果价格更新时间超过 `PRICE_STALE_AFTER_DAYS`，Agent 会提醒需要人工确认

## 后续联调建议

建议按这个顺序联调：

1. 先跑 `./scripts/dev.sh console`，确认 LLM 和知识库正常
2. 再确认 `LIVEKIT_URL` 对应的服务可用
3. 再跑 `./scripts/dev.sh`
4. 最后再去 `/settings` 配置需要启用的 STT / TTS
