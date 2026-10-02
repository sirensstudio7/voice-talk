# TKT-019 — Stop client-side connection timers from killing DB queries

- **Status:** in-progress
- **Priority:** P0
- **Area:** reliability / database
- **Effort:** S (≤ 1 day)
- **Depends on:** —
- **Source:** production log 2026-09-29 (`ERR_POSTGRES_LIFETIME_TIMEOUT`,
  `rev-00009`), 48h error scan via `kubeletto logs`

## Problem

Production 500s on unrelated endpoints (admin session detail, `/menu`, platform
login) with:

```
PostgresError: Max lifetime timeout reached after 5m
code: ERR_POSTGRES_LIFETIME_TIMEOUT
```

This is a **Bun SQL client bug**: the `idleTimeout` / `maxLifetime` timers
hard-fail connections (rejecting any in-flight query) instead of draining them
and reconnecting. Upstream: oven-sh/bun#30646; the fix PRs (#28587, #28591,
#30648) are all closed-unmerged or still open, and no released Bun version
(1.4.0 → 1.4.2) contains the fix. Our pool sets `maxLifetime: 300` and
`idleTimeout: 20`, so the race recurs in production (2 occurrences in 48h, plus
more historically).

The same 48h scan found a second, separate failure: **6× `remaining connection
slots are reserved`** (Aiven connection exhaustion) during deploy churn with
multiple revisions live at once — mitigated operationally by the
`DB_POOL_MAX` Kubeletto env, but the code default and docs still invite
over-subscription.

## Evidence

- 2× `ERR_POSTGRES_LIFETIME_TIMEOUT` in 48h (rev-00006, rev-00009); the code
  stack is `internal:sql/postgres` → `handleClose`, not a Postgres error.
- 6× `ERR_POSTGRES_SERVER_ERROR: remaining connection slots are reserved for
  roles with the SUPERUSER attribute` on 2026-09-28 17:00–18:45.
- `apps/server/src/db/client.ts`: `idleTimeout: 20`, `maxLifetime: 60 * 5`.
- `apps/server/src/db/login-db.ts`: `idleTimeout: 5`, `maxLifetime: 30`
  (per-request client — the timers are pointless there anyway).

## Proposal

1. **Remove `idleTimeout` and `maxLifetime`** from both pools. Connections are
   bounded by `max`; a wedged pool is already handled by `statement_timeout`
   (20s), the DB pool watchdog, and `resetDbPool`. Revisit only if/when a Bun
   release ships oven-sh/bun#30648.
2. **Lower the default `DB_POOL_MAX` to 4** and document the connection budget:
   two instances = 8 connections steady state; a rolling deploy can briefly run
   four pods = 16, still under Aiven's 20.
3. **Make resets visible**: count pool resets (`db.pool_reset_total`) and treat
   the Bun timer codes as connection errors so they are recycled rather than
   left in the pool.
4. **Add a guard test** so the timers cannot be reintroduced silently.

## Acceptance criteria

- [x] `db/client.ts` and `db/login-db.ts` contain no `idleTimeout` /
      `maxLifetime` (static guard test in `tests/db-pool-config.test.ts`).
- [x] Pool resets are counted in `/health?metrics=1`
      (`db.pool_reset_total`).
- [x] Docs (`DEPLOY.md`, `.env.production.example`, `MULTI-INSTANCE.md`) state
      the per-plan budget, including the rolling-deploy overlap.
- [ ] After the next production deploy: zero `ERR_POSTGRES_LIFETIME_TIMEOUT` /
      `ERR_POSTGRES_IDLE_TIMEOUT` and zero `remaining connection slots` in logs
      for 48h.

## Out of scope

- Switching drivers (`postgres-js` drains correctly but is a larger change).
- PgBouncer/connection-pooler adoption (Aiven offers it; revisit if traffic
  grows).

## Rollout / risk

Pure config change, no schema. Verify after deploy with
`kubeletto logs lorescale-api --since 48h --level error` and
`bun run verify:deploy`.
