# TKT-015 — Latency metrics (menu, first audio)

- **Status:** proposed
- **Priority:** P2
- **Area:** observability
- **Effort:** S (≤ 1 day)
- **Depends on:** TKT-005 (menu cache) for the baseline comparison
- **Source:** multi-instance branch work — metrics registry exists but only counts

## Problem

The metrics registry added with the multi-instance branch is counters and gauges
only. We cannot answer "how slow is the kiosk boot" or "how long from greeting
request to first audio" without grepping logs, and we cannot see regressions
before users do. `/menu` took 1.6–2.3 s for weeks before anyone noticed.

## Evidence

- `apps/server/src/http/metrics.ts` — `inc` / `setGauge` only.
- HTTP request durations are logged per line but never aggregated; WS greeting
  latency is logged only informally (`vision.greeting`).

## Proposal

1. Add a minimal observation helper:
   `observe(name, ms)` keeping `count`, `sum`, `max`, and a few fixed buckets
   (50/100/250/500/1000/2500/5000 ms) — enough for p50/p95 estimates without a
   Prometheus dependency.
2. Instrument:
   - `/menu` (uncached and cached, separate names),
   - voice session: socket open → `session.status connected`,
   - greeting dispatch → first assistant audio frame,
   - presenter: session start → first narration frame.
3. Expose under `/health?metrics=1` (bucket names must stay low-cardinality).
4. Log a `warn` with context when an observation exceeds a threshold
   (`MENU_SLOW_MS`, `FIRST_AUDIO_SLOW_MS`) so it shows up without a dashboard.

## Acceptance criteria

- [ ] `/health?metrics=1` returns the new observations after traffic.
- [ ] Slow cases emit a single warn line with the request/session id.
- [ ] Metric names documented in `docs/MULTI-INSTANCE.md`.

## Out of scope

- A real metrics stack (Prometheus/Grafana/OTel) — revisit if the platform
  outgrows JSON snapshots.
- Alert routing.

## Rollout / risk

Additive; measurement only. Watch that the snapshot stays small (< ~100 keys).
