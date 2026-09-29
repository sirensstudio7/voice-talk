# TKT-031 — Global presenter viewer cap via Redis (product-triggered)

- **Status:** proposed
- **Priority:** P3
- **Area:** cost / multi-instance
- **Effort:** S (≤ 1 day)
- **Depends on:** TKT-007 (per-instance cap), TKT-020 (Redis budget)
- **Source:** presenter scaling review 2026-09-29

## Problem

The presenter viewer cap (`PRESENTER_MAX_VIEWERS_PER_SESSION`) is per API
instance. With two pods, a share link landing on both instances can open up to
2× the intended number of narration sockets — and every socket is an
independent Gemini Live session with real cost.

## Proposal

Only if product wants a hard fleet-wide ceiling:

1. Redis counter per session (`presenter:viewers:<sessionId>`) with INCR on
   connect and DECR on close, TTL refreshed while active (≈2 commands per
   viewer connection — negligible at presenter volumes).
2. Reconcile orphans with a TTL: a crashed pod's viewers expire instead of
   blocking the room forever.
3. Keep the per-instance cap as the fast local guard; the Redis counter is the
   global ceiling.

## Acceptance criteria

- [ ] Cap holds across pods (open cap+1 viewers distributed over both).
- [ ] Crashed/closed sockets release their slot within the TTL.
- [ ] No measurable Redis budget impact (counters on `/health?metrics=1`).

## Out of scope

- Narrator audio fan-out/pre-rendering (TKT-007), which would remove the
  per-viewer session cost entirely.

## Rollout / risk

Additive counter; if Redis is unavailable, fall back to the per-instance cap
(fail open, log).
