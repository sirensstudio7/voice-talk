#!/usr/bin/env bash
# Validate env vars needed for production deploy.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Secrets live in apps/server/.env (Bun loads that file for the API). A
# repo-root .env is still read first for older setups; server values win.
found=0
for file in .env apps/server/.env; do
  if [[ -f "$file" ]]; then
    found=1
    echo "Reading $file"
    set -a
    # shellcheck disable=SC1090,SC1091
    source "$file" 2>/dev/null || true
    set +a
  fi
done

if [[ $found -eq 0 ]]; then
  echo "Missing env file: expected apps/server/.env (or .env at the repo root)"
  exit 1
fi

missing=0
for var in DATABASE_URL REDIS_URL S3_ENDPOINT S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_PUBLIC_BASE_URL GEMINI_API_KEY JWT_SECRET; do
  if [[ -z "${!var:-}" ]]; then
    echo "MISSING: $var"
    missing=1
  else
    echo "OK: $var"
  fi
done

if [[ -n "${REDIS_URL:-}" && "$REDIS_URL" == redis://* \
  && "$REDIS_URL" != *"127.0.0.1"* && "$REDIS_URL" != *"localhost"* ]]; then
  echo "WARN: REDIS_URL uses redis:// for a remote host; managed Redis (Upstash) needs rediss://"
fi

if [[ -n "${S3_PUBLIC_BASE_URL:-}" && "$S3_PUBLIC_BASE_URL" == http://* ]]; then
  echo "WARN: S3_PUBLIC_BASE_URL uses http://; public media should be https://"
fi

if [[ $missing -eq 1 ]]; then
  exit 1
fi

echo "Production env looks ready. See docs/DEPLOY.md for Render + Vercel steps."
