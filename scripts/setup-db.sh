#!/usr/bin/env bash
# Apply database migrations to DATABASE_URL (Postgres).
# For local dev: brew services start postgresql@16 && createdb voicetalk
# Migrations are plain Postgres SQL from db/migrations.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/server"
bun run db:migrate
