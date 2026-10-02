# TKT-023 — Adopt a Postgres connection pooler (PgBouncer) when scaling

- **Status:** proposed
- **Priority:** P2
- **Area:** database / scaling
- **Effort:** S (ops, ≤ 1 day) + verification
- **Depends on:** TKT-019/021 (pool hygiene)
- **Source:** 48h log scan found `remaining connection slots are reserved`
  during deploy churn, 2026-09-29

## Problem

Aiven's plan allows 20 concurrent Postgres connections for every client
combined. With 2 instances × `DB_POOL_MAX=4` we use 8 steady and 16 while a
rolling deploy runs both revisions — safe today, but every added pod,
migration tool or debug session eats the remaining headroom. Connection count
is the scaling ceiling, not query throughput.

## Evidence

- `docs/MULTI-INSTANCE.md` — connection budget table.
- Production logs 2026-09-28 17:00–18:45: six `remaining connection slots are
  reserved for roles with the SUPERUSER attribute` errors on `/menu`,
  platform login and admin pages during deploy churn.

## Proposal

Enable the managed connection pooler (Aiven PgBouncer, transaction mode),
point `DATABASE_URL` at the pooler port, and raise `DB_POOL_MAX` to 8–10 per
pod. The client already runs `prepare: false` specifically so the same
configuration works through a transaction pooler.

Verification checklist before switching:

- No session-level state in app queries (advisory locks, `SET`-per-session,
  prepared statements) — audit and record.
- Drizzle `db.transaction` works through transaction pooling (verified in
  staging with the smoke suite).
- `statement_timeout` stays in the app config (per-connection through the
  pooler needs care).
- Roll back by restoring the direct URL.

## Acceptance criteria

- [ ] Two instances plus a rolling deploy never exceed the plan's connection
      limit (monitor `pg_stat_activity` during the switch).
- [ ] Full smoke suite green against the pooler URL.
- [ ] `DB_POOL_MAX` guidance and the pooler URL documented in `DEPLOY.md`.

## Out of scope

- Self-hosted PgBouncer; changing the driver.

## Rollout / risk

Ops-only change with an instant revert (URL swap). Do it before scaling past
two instances rather than during an incident.
