# TKT-025 — Load/soak harness for kiosk, voice and booking bursts

- **Status:** proposed
- **Priority:** P2
- **Area:** testing / capacity
- **Effort:** M (2–4 days)
- **Depends on:** TKT-016 rollout (staging URL)
- **Source:** capacity review 2026-09-29 — no load testing exists

## Problem

We have unit/smoke coverage but no evidence of how the API behaves under
realistic bursts: a mall kiosk waking up with several tablets, concurrent
voice sessions, a booking race, or a menu stampede after a cache flush. With
two pods and 4 DB connections each, saturation looks like queuing, and we have
not measured where it starts.

## Proposal

A repo script (`apps/server/scripts/load-test.ts`, autocannon or Bun-native
fetch loops) with scenarios:

1. **Kiosk boot:** N concurrent `/menu?business=…` (cold and warm cache), plus
   `/health`.
2. **Browse/order:** availability checks and order confirm with unique
   idempotency keys (TKT-018) and rate-limit-aware pacing.
3. **Voice burst:** M concurrent `ws-probe`-style sessions for 30 s (billed —
   run only against staging with a test tenant).
4. **Booking race:** concurrent creates for one slot, asserting exactly one 201
   and the rest 409.

Output: p50/p95/p99, error breakdown, pool reset counter, Redis commands
delta. Document thresholds and the max supported concurrency for 2 pods.

## Acceptance criteria

- [ ] Script runs against staging with one command and a safe default load.
- [ ] README/runbook documents how to read the report and the current limits
      (e.g., "2 pods sustain X kiosk boots/min with p95 < Y ms").
- [ ] Any saturation trigger found becomes a ticket (or an autoscaling input).

## Out of scope

- Running load tests against production.
- A permanent load-testing environment.

## Rollout / risk

Read-only against staging except the explicitly opted-in voice/order scenarios
(they create rows and minutes).
