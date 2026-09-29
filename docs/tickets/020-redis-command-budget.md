# TKT-020 — Redis command budget: cheaper instance heartbeat + accounting

- **Status:** in-progress
- **Priority:** P1
- **Area:** cost / multi-instance
- **Effort:** S (≤ 1 day)
- **Depends on:** TKT-006 (instance presence for the LIVE guard)
- **Source:** Redis utilization audit, 2026-09-29

## Problem

The instance heartbeat we added for the LIVE guard dominates Redis traffic:
one `SET` every 15s per pod ≈ **172,800 commands/pod/month → ~345,600 for two
pods**, about **69% of the 500k Upstash free-tier budget** before any product
traffic. With health pings (~86k), job locks (~29k) and rate limits, the total
lands at ~470–520k/month — at or over the free tier, and the limit is discovered
only when Upstash throttles. There is no in-app visibility into command usage.

## Proposal

1. Heartbeat interval **15s → 60s**, TTL **45s → 150s**: saves ~259k
   commands/month (~55% of total traffic). A new pod still registers on boot,
   so multi-instance detection stays immediate; only stale detection after
   scaling **down** lags (≤2.5 min), acceptable for a guard.
2. Client-side command accounting: `redis.commands_total` plus per-purpose
   counters (`rate_limit`, `lock`, `health`, `heartbeat`, `instance_count`,
   `bus_publish`) on `/health?metrics=1`.
3. Document the budget table in `MULTI-INSTANCE.md` so future features can
   price their commands before adding periodic work.

## Acceptance criteria

- [x] Heartbeat constants are 60s/150s (`services/instance-registry.ts`).
- [x] Per-purpose counters increment and are asserted in
      `tests/instance-registry.test.ts`.
- [x] Budget table documented in `docs/MULTI-INSTANCE.md`.
- [ ] After deploy: `redis.commands_total` on `/health?metrics=1` grows at
      roughly the documented rate (spot-check a day apart).

## Implementation notes

- Deliberately kept: 60s Redis health cache (readiness freshness), 5–10 min job
  ticks (operational freshness), and the kiosk bus (rare, config-driven).
- Deliberately not done: Redis-cached fleet metrics (~1.3M commands/month for
  ~100 metrics), Redis-shared `/menu` cache (per-instance + bus invalidation is
  cheaper and faster), Redis idempotency store (DB unique indexes are the
  contract).

## Out of scope

- Switching rate limiting to a sliding window (still one Lua command).
- Upstash budget alerts (dashboard-side).

## Rollout / risk

Internal-only config and counters; no API or behavior change outside the LIVE
guard's stale window. Ship with the next image.
