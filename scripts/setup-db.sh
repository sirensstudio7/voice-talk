#!/usr/bin/env bash
# Apply Supabase migrations to DATABASE_URL (Postgres).
# For local dev: brew services start postgresql@16 && createdb voicetalk
# For Supabase: run 002_storage_buckets.sql manually in Supabase SQL editor (requires storage schema).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/server"
npm run db:migrate
