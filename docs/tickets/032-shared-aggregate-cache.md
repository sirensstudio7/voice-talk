# TKT-032 — Redis-cached shared aggregates (platform dashboard)

- **Status:** proposed
- **Priority:** P3
- **Area:** performance
- **Effort:** S (≤ 1 day)
- **Depends on:** TKT-020 (Redis budget), TKT-027 (observability decision)
- **Source:** DB audit 2026-09-29

## Problem

The platform dashboard runs ~10 `count(*)`/`sum` queries per load (users,
active users, businesses, demo requests, minutes, etc.). It is admin-only and
rare today, so it is not a bottleneck — but it is the one spot where a
**shared** cache (as opposed to the in-process tenant cache, TKT-022) is the
right tool: every admin sees the same numbers, a 60s stale value is harmless,
and each cached load costs one Redis command instead of ten round trips.

## Proposal

1. When admin volume grows (trigger: dashboard p95 > 300 ms or > ~100 loads/h),
   wrap the aggregate block in a Redis-cached JSON response keyed by scope and
   a 60s TTL.
2. Invalidate on writes that change the numbers if freshness matters more than
   the TTL (subscription approvals, demo requests) — otherwise TTL only.
3. Expose `dashboard.cache_hits_total` / `_misses_total`.

## Acceptance criteria

- [ ] Dashboard p95 < 100 ms warm; ≤1 Redis command per cached load.
- [ ] Numbers are within the TTL when compared to a forced refresh.
- [ ] No Redis usage when the trigger has not been met (ticket stays proposed).

## Out of scope

- Materialized views or a warehouse; real-time dashboards.

## Rollout / risk

Cache only the read path; admin writes are unaffected. Keep a `?refresh=1`
escape hatch for support.
