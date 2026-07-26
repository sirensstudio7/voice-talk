#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VISION_DIR="$ROOT/services/vision"
PID_FILE="$ROOT/.vision.pid"
SLUG_FILE="$ROOT/.vision.slug"
LOG_FILE="$ROOT/.vision.log"
WS_URL="${VISION_WS_URL:-ws://127.0.0.1:8000/ws/vision}"

read_saved_slug() {
  if [ -f "$SLUG_FILE" ]; then
    tr -d '[:space:]' <"$SLUG_FILE"
  fi
}

resolve_slug() {
  local slug="${1:-}"
  if [ -z "$slug" ]; then
    slug="$(read_saved_slug || true)"
  fi
  printf '%s' "$slug"
}

kill_vision() {
  if [ -f "$PID_FILE" ]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "Stopping vision process ${pid}..."
      kill "$pid" 2>/dev/null || true
      sleep 1
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
      fi
    fi
    rm -f "$PID_FILE"
  fi

  pkill -f "${VISION_DIR}/.venv/bin/python3 main.py --business" 2>/dev/null || true
  pkill -f "python3 main.py --business" 2>/dev/null || true
  pkill -f "python main.py --business" 2>/dev/null || true
}

start_vision() {
  local slug
  slug="$(resolve_slug "${1:-}")"
  if [ -z "$slug" ]; then
    echo "Business slug required." >&2
    exit 1
  fi

  if [ ! -d "$VISION_DIR" ]; then
    echo "Missing services/vision directory." >&2
    exit 1
  fi

  if [ -f "$VISION_DIR/scripts/download-hand-model.sh" ]; then
    bash "$VISION_DIR/scripts/download-hand-model.sh" || true
  fi

  kill_vision
  cd "$VISION_DIR"
  PYTHON="${VISION_DIR}/.venv/bin/python3"
  if [ ! -x "$PYTHON" ]; then
    PYTHON="python3"
  fi

  local -a vision_args=(--business "$slug" --ws-url "$WS_URL")
  if [ "${VISION_DEBUG:-0}" = "1" ]; then
    vision_args+=(--debug)
  fi

  nohup "$PYTHON" main.py "${vision_args[@]}" >>"$LOG_FILE" 2>&1 &
  local pid=$!
  echo "$pid" >"$PID_FILE"
  echo "$slug" >"$SLUG_FILE"
  disown
  if [ "${VISION_DEBUG:-0}" = "1" ]; then
    echo "Vision started for ${slug} with debug preview (pid ${pid}, log: .vision.log)"
  else
    echo "Vision started for ${slug} (pid ${pid}, log: .vision.log)"
  fi
}

vision_running() {
  if [ ! -f "$PID_FILE" ]; then
    return 1
  fi
  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

ensure_vision() {
  local slug
  slug="$(resolve_slug "${1:-}")"
  if [ -z "$slug" ]; then
    echo "Vision ensure skipped (no business slug saved — run: bash scripts/dev-vision.sh start <slug>)"
    return 0
  fi

  if vision_running; then
    echo "Vision already running for ${slug}"
    return 0
  fi

  echo "Vision not running (or crashed). Starting for ${slug}..."
  start_vision "$slug"
  sleep 2
  if vision_running; then
    echo "Vision healthy for ${slug}"
  else
    echo "Vision failed to stay running — check .vision.log (often macOS camera permission)." >&2
    tail -n 3 "$LOG_FILE" >&2 || true
    return 1
  fi
}

status_vision() {
  local running=false
  local pid=""
  local slug=""

  if [ -f "$PID_FILE" ]; then
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      running=true
      slug="$(ps -p "$pid" -o command= 2>/dev/null | sed -n 's/.*--business \([^ ]*\).*/\1/p' || true)"
    fi
  fi

  if [ -z "$slug" ]; then
    slug="$(read_saved_slug || true)"
  fi

  printf '{"running":%s,"pid":"%s","business_slug":"%s"}\n' "$running" "$pid" "$slug"
}

case "${1:-status}" in
  start)
    start_vision "${2:-}"
    ;;
  stop)
    kill_vision
    echo "Vision stopped."
    ;;
  restart)
    start_vision "${2:-}"
    ;;
  ensure)
    ensure_vision "${2:-}"
    ;;
  status)
    status_vision
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|ensure|status} [business_slug]" >&2
    exit 1
    ;;
esac
