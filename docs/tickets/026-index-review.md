# TKT-026 — Production index and query-plan review

- **Status:** proposed
- **Priority:** P3
- **Area:** performance / database
- **Effort:** S (≤ 1 day, data-dependent)
- **Depends on:** TKT-008/024 (query shapes settle first)
- **Source:** DB audit 2026-09-29

## Problem

Indexes were added reactively (analytics composites, appointment GiST). Nobody
has looked at the top queries by total time on production-sized data, and
several hot paths (voice sessions by business/date, orders by business/date,
conversations lists) rely on single-column indexes from early migrations.

## Proposal

1. Collect the top queries by total time. Aiven free may not expose
   `pg_stat_statements`; fall back to logs plus manual `EXPLAIN (ANALYZE,
   BUFFERS)` against a restored copy or a seeded staging database.
2. For each of the top ~10, check whether the plan uses an index and whether a
   composite/partial index removes a sort or heap scan.
3. Ship indexes as one migration (idempotent `CREATE INDEX IF NOT EXISTS`) and
   record before/after timings in the ticket.

## Acceptance criteria

- [ ] Top 10 production queries have plans and timings recorded.
- [ ] Any added index shows a measured improvement (or is not added).
- [ ] No index added for a query that runs `< a few times/day` (write cost).

## Out of scope

- Partitioning; read replicas; moving analytics to another store.

## Rollout / risk

Index creation is additive; use `CREATE INDEX IF NOT EXISTS` and remember the
migration runner applies files in order. Watch disk/connection usage while
building on small plans.
