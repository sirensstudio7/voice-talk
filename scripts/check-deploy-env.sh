#!/usr/bin/env bash
# Validate env vars needed for production deploy.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env"
  exit 1
fi

# shellcheck disable=SC1091
source .env 2>/dev/null || true

missing=0
for var in DATABASE_URL GEMINI_API_KEY JWT_SECRET; do
  if [[ -z "${!var:-}" ]]; then
    echo "MISSING: $var"
    missing=1
  else
    echo "OK: $var"
  fi
done

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "WARN: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset (uploads use local disk only)"
fi

if [[ $missing -eq 1 ]]; then
  exit 1
fi

echo "Production env looks ready. See docs/DEPLOY.md for Render + Vercel steps."
