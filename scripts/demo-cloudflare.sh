#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_PORT=8000
APP_PORT=6670
API_LOG="$ROOT/.demo-api.log"
APP_LOG="$ROOT/.demo-app.log"
API_TUNNEL_LOG="$ROOT/.demo-api-tunnel.log"
APP_TUNNEL_LOG="$ROOT/.demo-app-tunnel.log"
ENV_LOCAL="$ROOT/apps/customer-app/.env.local"
ENV_LOCAL_BACKUP="$ROOT/apps/customer-app/.env.local.demo-backup"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found. Install with: brew install cloudflared"
  exit 1
fi

if [[ ! -f "$ROOT/.env" ]]; then
  echo "Missing .env — copy .env.example and set GEMINI_API_KEY first."
  exit 1
fi

free_port() {
  local port="$1"
  local pids

  pids=$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "Stopping existing process on port $port..."
    kill $pids 2>/dev/null || true
    sleep 1
  fi
}

cleanup() {
  echo
  echo "Stopping demo..."
  [[ -n "${APP_PID:-}" ]] && kill "$APP_PID" 2>/dev/null || true
  [[ -n "${API_PID:-}" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "${API_TUNNEL_PID:-}" ]] && kill "$API_TUNNEL_PID" 2>/dev/null || true
  [[ -n "${APP_TUNNEL_PID:-}" ]] && kill "$APP_TUNNEL_PID" 2>/dev/null || true

  if [[ -f "$ENV_LOCAL_BACKUP" ]]; then
    mv "$ENV_LOCAL_BACKUP" "$ENV_LOCAL"
    echo "Restored apps/customer-app/.env.local"
  fi
}
trap cleanup EXIT INT TERM

wait_for_tunnel_url() {
  local log_file="$1"
  local timeout=60
  local elapsed=0

  while [[ $elapsed -lt $timeout ]]; do
    if url=$(grep -Eo 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$log_file" | head -1); then
      echo "$url"
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  echo "Timed out waiting for Cloudflare tunnel URL. Check $log_file"
  exit 1
}

wait_for_http() {
  local url="$1"
  local timeout=120
  local elapsed=0

  while [[ $elapsed -lt $timeout ]]; do
    if curl -sf "$url" >/dev/null; then
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done

  echo "Timed out waiting for $url"
  exit 1
}

free_port "$API_PORT"
free_port "$APP_PORT"

echo "Starting API on port $API_PORT..."
(
  cd "$ROOT/apps/server"
  npm run dev
) >"$API_LOG" 2>&1 &
API_PID=$!

wait_for_http "http://127.0.0.1:$API_PORT/health"
echo "API is up."

echo "Opening Cloudflare tunnel for API..."
cloudflared tunnel --url "http://127.0.0.1:$API_PORT" >"$API_TUNNEL_LOG" 2>&1 &
API_TUNNEL_PID=$!
API_PUBLIC_URL="$(wait_for_tunnel_url "$API_TUNNEL_LOG")"
echo "API tunnel: $API_PUBLIC_URL"

if [[ -f "$ENV_LOCAL" ]]; then
  cp "$ENV_LOCAL" "$ENV_LOCAL_BACKUP"
fi

cat >"$ENV_LOCAL" <<EOF
NEXT_PUBLIC_API_URL=$API_PUBLIC_URL
NEXT_PUBLIC_WS_URL=${API_PUBLIC_URL/https:/wss:}/ws/session
EOF
echo "Wrote apps/customer-app/.env.local with tunnel URLs."

echo "Building frontend for production (needed for Cloudflare tunnel)..."
(
  cd "$ROOT"
  npm run build --workspace=customer-app
) >"$APP_LOG" 2>&1

echo "Starting frontend on port $APP_PORT..."
(
  cd "$ROOT"
  npm run start --workspace=customer-app
) >>"$APP_LOG" 2>&1 &
APP_PID=$!

wait_for_http "http://127.0.0.1:$APP_PORT/"
echo "Frontend is up."

echo "Opening Cloudflare tunnel for frontend..."
cloudflared tunnel --url "http://127.0.0.1:$APP_PORT" >"$APP_TUNNEL_LOG" 2>&1 &
APP_TUNNEL_PID=$!
APP_PUBLIC_URL="$(wait_for_tunnel_url "$APP_TUNNEL_LOG")"

echo
echo "=========================================="
echo "  Lorescale demo is live (no credit card)"
echo "=========================================="
echo
echo "Share this link (open in Chrome or Safari):"
echo "  $APP_PUBLIC_URL/b/sunrise-coffee"
echo
echo "API health check:"
echo "  $API_PUBLIC_URL/health"
echo
echo "Keep this terminal open during the demo."
echo "Press Ctrl+C to stop everything."
echo

wait
