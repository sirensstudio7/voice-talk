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
  echo "Check DATABASE_URL in .env — for local dev, start Postgres via docker compose." >&2
  return 1
}

clear_proxy_env() {
  unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
  unset SOCKS_PROXY SOCKS5_PROXY socks_proxy socks5_proxy
  unset GIT_HTTP_PROXY GIT_HTTPS_PROXY
}

start_api_daemon() {
  if [ ! -d "$ROOT/node_modules" ]; then
    echo "Missing node_modules at repo root — run bun install" >&2
    exit 1
  fi

  kill_port
  clear_proxy_env
  cd "$SERVER_DIR"
  nohup bun run dev >>"$API_LOG" 2>&1 &
  disown
}

start_api() {
  if [ ! -d "$ROOT/node_modules" ]; then
    echo "Missing node_modules at repo root — run bun install" >&2
    exit 1
  fi

  kill_port
  clear_proxy_env
  cd "$SERVER_DIR"
  exec bun run dev
}

case "${1:-start}" in
  start)
    start_api
    ;;
  restart)
    kill_port
    start_api_daemon
    wait_for_health
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
      exit 0
    fi
    if curl -sf --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then
      echo "API is running — waiting for database..."
      # Stuck Postgres pools rarely recover without a process restart.
      # Only wait briefly, then recycle the API.
      if wait_for_health 6; then
        exit 0
      fi
      echo "Database still unreachable — restarting API..."
    else
      echo "API not responding. Starting in background (log: .api.log)..."
    fi
    start_api_daemon
    wait_for_health 30
    ;;
  *)
    echo "Usage: $0 {start|restart|stop|health|ensure}" >&2
    exit 1
    ;;
esac
