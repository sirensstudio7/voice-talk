#!/usr/bin/env bash
# Apply Supabase migrations to DATABASE_URL (Postgres).
# For local dev: brew services start postgresql@16 && createdb voicetalk
# Migrations are plain Postgres — no Supabase storage schema required.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/server"
npm run db:migrate
