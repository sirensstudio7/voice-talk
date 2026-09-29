# TKT-021 — Health checks must not open a Postgres connection per probe

- **Status:** in-progress
- **Priority:** P1
- **Area:** reliability / database
- **Effort:** S (≤ 1 day)
- **Depends on:** TKT-019 (same Bun timer bug class)
- **Source:** DB connection audit after TKT-019, 2026-09-29

## Problem

`db/health.ts` created a **disposable 1-connection SQL client for every probe**:
up to 4 checks/min per pod (15s success cache) = ≈172k new Postgres
connections/month/pod, each with a full handshake, against a 20-connection
plan shared by two instances, logins and tooling. It also still carried
`idleTimeout: 1` / `maxLifetime: 5` — the same Bun timers that hard-fail
in-flight queries (TKT-019) — so a `select 1` could fail at the 5s lifetime
boundary.

## Proposal

Ping through the shared pool (`getDbPoolClient().unsafe("select 1")`) under the
existing timeout race. `select 1` is tiny; if the pool is genuinely wedged the
watchdog, `statement_timeout` and `resetDbPool` already recover it — and a
slow probe then reflects real pool saturation instead of hiding it behind a
fresh connection.

## Acceptance criteria

- [x] No SQL client is created inside `db/health.ts`; no connection timers
      (guard test now covers `client.ts`, `login-db.ts`, `health.ts`).
- [x] Successful probes are counted (`db.health_ping_total`).
- [x] Health caching (15s success / 2s failure) is unchanged.

## Implementation notes

- `getDbPoolClient()` returns the current client, so a pool reset is picked up
  automatically.
- Per-pod steady connections are now `DB_POOL_MAX` (4) plus a transient login
  connection — the health probe no longer consumes a slot of its own.
- Trade-off accepted: if all pool slots are busy, `/health` reports degraded
  (which readiness should act on) instead of bypassing the pool.

## Out of scope

- A persistent dedicated health connection (would add a connection to every
  pod's footprint for no churn saving once the shared pool is used).
- PgBouncer adoption (separate decision).

## Rollout / risk

No schema or API change. Verify after deploy: `/health?db=1` stays green and
Postgres `pg_stat_activity` no longer shows a stream of short-lived
`voice-talk-api-health` backends.
