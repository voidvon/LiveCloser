#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-all}"

BACKEND_PID=""
LIVEKIT_PID=""
KB_PID=""

info() {
  printf '[dev] %s\n' "$1"
}

warn() {
  printf '[dev] warning: %s\n' "$1" >&2
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf '[dev] error: missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

load_env_value() {
  local file="$1"
  local key="$2"

  if [[ ! -f "$file" ]]; then
    return 1
  fi

  awk -F= -v key="$key" '$1 == key { print substr($0, index($0, "=") + 1); exit }' "$file"
}

get_livekit_url() {
  load_env_value "$ROOT_DIR/.env" "LIVEKIT_URL" || true
}

is_local_livekit_url() {
  local livekit_url host remainder
  livekit_url="$(get_livekit_url)"

  [[ "$livekit_url" =~ ^wss?:// ]] || return 1
  remainder="${livekit_url#*://}"
  host="${remainder%%[:/]*}"
  [[ "$host" == "127.0.0.1" || "$host" == "localhost" ]]
}

get_livekit_host_port() {
  local livekit_url host port remainder
  livekit_url="$(get_livekit_url)"

  [[ "$livekit_url" =~ ^wss?:// ]] || return 1

  remainder="${livekit_url#*://}"
  host="${remainder%%[:/]*}"
  port="${remainder#"$host"}"
  port="${port#:}"
  port="${port%%/*}"
  port="${port:-80}"

  printf '%s %s\n' "$host" "$port"
}

check_livekit_reachable() {
  local host="$1"
  local port="$2"

  if ! command -v nc >/dev/null 2>&1; then
    return 1
  fi

  nc -z "$host" "$port" >/dev/null 2>&1
}

start_livekit_if_needed() {
  local livekit_url host port api_key api_secret

  livekit_url="$(get_livekit_url)"
  if [[ -z "$livekit_url" ]]; then
    warn "ROOT .env is missing LIVEKIT_URL; backend may fail to connect."
    return
  fi

  if ! is_local_livekit_url; then
    info "LIVEKIT_URL points to a remote server, skipping local LiveKit startup"
    return
  fi

  read -r host port < <(get_livekit_host_port)
  if check_livekit_reachable "$host" "$port"; then
    info "local LiveKit already reachable at $host:$port"
    return
  fi

  require_cmd livekit-server

  api_key="$(load_env_value "$ROOT_DIR/.env" "LIVEKIT_API_KEY" || true)"
  api_secret="$(load_env_value "$ROOT_DIR/.env" "LIVEKIT_API_SECRET" || true)"

  if [[ -z "$api_key" || -z "$api_secret" ]]; then
    printf '[dev] error: .env must define LIVEKIT_API_KEY and LIVEKIT_API_SECRET for local LiveKit startup\n' >&2
    exit 1
  fi

  info "starting local LiveKit server on $host:$port"
  (
    cd "$ROOT_DIR"
    LIVEKIT_KEYS="$api_key: $api_secret" livekit-server --dev --bind "$host"
  ) &
  LIVEKIT_PID="$!"

  sleep 2
  if ! check_livekit_reachable "$host" "$port"; then
    printf '[dev] error: local LiveKit server did not become ready on %s:%s\n' "$host" "$port" >&2
    exit 1
  fi
}

cleanup() {
  if [[ -n "${LIVEKIT_PID:-}" ]] && kill -0 "$LIVEKIT_PID" >/dev/null 2>&1; then
    info "stopping LiveKit ($LIVEKIT_PID)"
    kill "$LIVEKIT_PID" >/dev/null 2>&1 || true
    wait "$LIVEKIT_PID" 2>/dev/null || true
  fi

  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    info "stopping backend ($BACKEND_PID)"
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi

  if [[ -n "${KB_PID:-}" ]] && kill -0 "$KB_PID" >/dev/null 2>&1; then
    info "stopping kb service ($KB_PID)"
    kill "$KB_PID" >/dev/null 2>&1 || true
    wait "$KB_PID" 2>/dev/null || true
  fi
}

start_backend() {
  require_cmd uv
  start_livekit_if_needed

  info "starting backend agent"
  cd "$ROOT_DIR"
  UV_CACHE_DIR="$ROOT_DIR/.uv-cache" uv run python src/agent.py dev
}

start_frontend() {
  require_cmd npm

  info "starting frontend dev server"
  cd "$ROOT_DIR/frontend"
  npm run dev
}

start_kb_service() {
  require_cmd uv

  info "starting knowledge base service with reload"
  cd "$ROOT_DIR"
  UV_CACHE_DIR="$ROOT_DIR/.uv-cache" uv run uvicorn src.kb_server:app --host 127.0.0.1 --port 8001 --reload
}

start_console() {
  require_cmd uv

  info "starting backend text console"
  cd "$ROOT_DIR"
  UV_CACHE_DIR="$ROOT_DIR/.uv-cache" uv run python src/agent.py console --text
}

start_all() {
  trap cleanup EXIT INT TERM

  start_livekit_if_needed

  cd "$ROOT_DIR"
  UV_CACHE_DIR="$ROOT_DIR/.uv-cache" uv run uvicorn src.kb_server:app --host 127.0.0.1 --port 8001 --reload &
  KB_PID="$!"
  info "kb service started in background (pid: $KB_PID)"

  UV_CACHE_DIR="$ROOT_DIR/.uv-cache" uv run python src/agent.py dev &
  BACKEND_PID="$!"
  info "backend started in background (pid: $BACKEND_PID)"

  start_frontend
}

case "$MODE" in
  all)
    start_all
    ;;
  backend)
    start_backend
    ;;
  kb)
    trap cleanup EXIT INT TERM
    start_kb_service
    ;;
  frontend)
    start_frontend
    ;;
  livekit)
    trap cleanup EXIT INT TERM
    start_livekit_if_needed
    if [[ -n "${LIVEKIT_PID:-}" ]]; then
      wait "$LIVEKIT_PID"
    fi
    ;;
  console)
    start_console
    ;;
  *)
    cat <<'EOF' >&2
Usage: ./scripts/dev.sh [all|backend|kb|frontend|livekit|console]

  all       Start local LiveKit if needed, then backend and frontend
  backend   Start local LiveKit if needed, then only the LiveKit agent backend
  kb        Start only the knowledge base service
  frontend  Start only the Next.js frontend
  livekit   Start only the local LiveKit server when LIVEKIT_URL is local
  console   Start backend in text console mode
EOF
    exit 1
    ;;
esac
