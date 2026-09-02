#!/usr/bin/env bash
set -euo pipefail

PORT="${API_PORT:-8000}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="$ROOT/apps/server"
API_LOG="$ROOT/.api.log"
HEALTH_URL="http://127.0.0.1:${PORT}/health"
HEALTH_DB_URL="http://127.0.0.1:${PORT}/health?db=1"

kill_port() {
  local pids
  pids="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "Stopping stale process on port ${PORT}..."
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 1
    pids="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
    if [ -n "$pids" ]; then
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
      sleep 0.5
    fi
  fi

  pkill -f "bun --watch src/index.ts" 2>/dev/null || true
  pkill -f "bun src/index.ts" 2>/dev/null || true
  sleep 1
}

wait_for_health() {
  local retries="${1:-30}"
  local i
  for ((i = 1; i <= retries; i++)); do
    local health_json
    health_json="$(curl -sf --max-time 10 "$HEALTH_DB_URL" 2>/dev/null || true)"
    if [ -n "$health_json" ] && echo "$health_json" | grep -q '"db_online":true'; then
      echo "API and database healthy at ${HEALTH_URL}"
      return 0
    fi
    sleep 1
  done
  echo "API failed to become healthy at ${HEALTH_URL}" >&2
  echo "Check DATABASE_URL in .env — for local dev, prefer Supabase Session pooler (port 5432)." >&2
  return 1
}

clear_proxy_env() {
  unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
  unset SOCKS_PROXY SOCKS5_PROXY socks_proxy socks5_proxy
  unset GIT_HTTP_PROXY GIT_HTTPS_PROXY
}

start_api_daemon() {
  if [ ! -d "$SERVER_DIR/node_modules" ]; then
    echo "Missing node_modules at apps/server — run npm install from repo root" >&2
    exit 1
  fi

  kill_port
  clear_proxy_env
  cd "$SERVER_DIR"
  nohup npm run dev >>"$API_LOG" 2>&1 &
  disown
}

start_api() {
  if [ ! -d "$SERVER_DIR/node_modules" ]; then
    echo "Missing node_modules at apps/server — run npm install from repo root" >&2
    exit 1
  fi

  kill_port
  clear_proxy_env
  cd "$SERVER_DIR"
  exec npm run dev
}

ensure_vision_sidecar() {
  if [ "${SKIP_VISION:-0}" = "1" ]; then
    echo "Skipping vision sidecar (SKIP_VISION=1)."
    return 0
  fi
  local vision_script="$ROOT/scripts/dev-vision.sh"
  if [ ! -f "$vision_script" ]; then
    return 0
  fi
  bash "$vision_script" ensure
}

restart_vision_sidecar_debug() {
  local vision_script="$ROOT/scripts/dev-vision.sh"
  if [ ! -f "$vision_script" ]; then
    return 0
  fi
  echo "Restarting vision sidecar (debug preview)..."
  VISION_DEBUG=1 bash "$vision_script" restart
  sleep 2
  if VISION_DEBUG=1 bash "$vision_script" status | grep -q '"running":true'; then
    echo "Vision debug running ($(cat "$ROOT/.vision.slug" 2>/dev/null || echo unknown), log: .vision.log)"
  else
    echo "Vision failed to stay running — check .vision.log (often macOS camera permission)." >&2
    tail -n 3 "$ROOT/.vision.log" 2>/dev/null >&2 || true
    return 1
  fi
}

case "${1:-start}" in
  start)
    start_api
    ;;
  restart)
    kill_port
    start_api_daemon
    wait_for_health
    restart_vision_sidecar_debug
    ;;
  stop)
    kill_port
    echo "API stopped."
    ;;
  health)
    curl -sf --max-time 2 "$HEALTH_URL"
    echo ""
    ;;
  ensure)
    if curl -sf --max-time 10 "$HEALTH_DB_URL" 2>/dev/null | grep -q '"db_online":true'; then
      echo "API and database already healthy at ${HEALTH_URL}"
      ensure_vision_sidecar
      exit 0
    fi
    if curl -sf --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then
      echo "API is running — waiting for database..."
      # Stuck Postgres pools rarely recover without a process restart.
      # Only wait briefly, then recycle the API.
      if wait_for_health 6; then
        ensure_vision_sidecar
        exit 0
      fi
      echo "Database still unreachable — restarting API..."
    else
      echo "API not responding. Starting in background (log: .api.log)..."
    fi
    start_api_daemon
    wait_for_health 30
    ensure_vision_sidecar
    ;;
  *)
    echo "Usage: $0 {start|restart|stop|health|ensure}" >&2
    exit 1
    ;;
esac
