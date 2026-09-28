#!/usr/bin/env bash
# Runs the API test suite against throwaway Postgres + Redis containers.
#
#   bun run test:with-services            # full suite (unit + smoke)
#   bun run test:with-services tests/smoke.test.ts
#
# Ports are overridable: PG_PORT=55433 REDIS_PORT=56380 bun run test:with-services
set -euo pipefail
cd "$(dirname "$0")/.."

PG_PORT="${PG_PORT:-55432}"
REDIS_PORT="${REDIS_PORT:-56379}"
PG_NAME="vt-test-pg"
REDIS_NAME="vt-test-redis"

docker rm -f "$PG_NAME" "$REDIS_NAME" >/dev/null 2>&1 || true
docker run -d --name "$PG_NAME" -p "$PG_PORT:5432" \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=voicetalk \
  postgres:17-alpine >/dev/null
docker run -d --name "$REDIS_NAME" -p "$REDIS_PORT:6379" redis:8-alpine >/dev/null
trap 'docker rm -f "$PG_NAME" "$REDIS_NAME" >/dev/null 2>&1 || true' EXIT

until docker exec "$PG_NAME" pg_isready -U postgres -d voicetalk -q 2>/dev/null; do sleep 0.3; done
until docker exec "$REDIS_NAME" redis-cli ping >/dev/null 2>&1; do sleep 0.2; done

export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${PG_PORT}/voicetalk"
export REDIS_URL="redis://127.0.0.1:${REDIS_PORT}"
export SMOKE_TESTS=1
export PLATFORM_ADMIN_EMAIL="${PLATFORM_ADMIN_EMAIL:-superadmin@lorescale.com}"
export PLATFORM_ADMIN_PASSWORD="${PLATFORM_ADMIN_PASSWORD:-superadmin123}"

bun scripts/migrate.ts >/dev/null
bun scripts/seed.ts >/dev/null
bun test "$@"
