# TKT-001 — Atomic voice-minute debit

- **Status:** in-progress (code on `feat/multi-instance-hardening`, deploy with TKT-016)
- **Priority:** P0
- **Area:** money / voice minutes
- **Effort:** S (≤ 1 day)
- **Depends on:** —
- **Source:** feature inventory review, 2026-09-29

## Problem

Voice minutes are the revenue unit. `debitVoiceSession` charges an ended session
by consuming `minute_grants` lots, but the lot updates are a read-modify-write
loop outside any transaction. Two sessions ending at the same time (now trivially
possible on two API instances) can read the same `remaining_seconds` and both
write back a decremented value, so the wallet is under-charged or overspent.

The ledger `idempotency_key` protects against double-debiting the *same* session,
not against concurrent debits of *different* sessions.

## Evidence

- `apps/server/src/services/voice-minutes.ts` — `consumeLots()` selects lots then
  loops `update minute_grants set remaining_seconds = lot.remainingSeconds - take`,
  no transaction or conditional update.
- `debitVoiceSession()` is called from session teardown and from the orphan sweep
  (`services/voice-minute-jobs.ts`) — two trigger paths.
- Multi-instance rollout (TKT-016) makes concurrent debits the normal case, not an
  edge case.

## Proposal

Make the debit atomic and race-safe, keeping the existing ledger contract:

1. Wrap `consumeLots` in `db.transaction`, selecting the user's live lots with
   `SELECT … FOR UPDATE` (ordered exactly as today: subscription first, then
   soonest expiry).
2. As a belt-and-braces fallback for paths that cannot take the lock, make the
   per-lot update conditional
   (`where id = $1 and remaining_seconds >= $2`) and re-read on conflict.
3. Keep the existing unique `idempotency_key` insert so the whole debit stays
   exactly-once per session.

Alternatives considered: a SQL `UPDATE … RETURNING` set-based consume (faster but
harder to keep subscription-first ordering); an advisory lock keyed by `user_id`
(simpler, still fine, but a row lock documents intent better).

## Acceptance criteria

- [x] A concurrency test seeds one lot and runs two debits in parallel; final
      `remaining_seconds` equals `initial - sum(charges)` and never goes negative.
      (`tests/billing.test.ts` — four concurrent 30s debits drain a 100s lot,
      asserting `remaining = 0`, `charged = 100`, conservation.)
- [x] Existing debit idempotency test still passes (same session debited twice
      charges once).
- [x] Metric `minutes.debit_retry_total` is exposed on `/health?metrics=1`.

## Implementation notes

- `consumeLots` now runs in `db.transaction` with `.for("update")` on the live
  lots, and each lot update is conditional (`remaining_seconds >= take`) as the
  no-lock fallback; shortfalls are counted by `minutes.debit_retry_total`.
- No schema change; `debitVoiceSession`, the orphan sweep, and admin adjustments
  keep the same contract.

## Out of scope

- Reworking the ledger model or expiry semantics.
- A scheduled grant-expiry job (expiry stays lazy on read).

## Rollout / risk

Pure backend change behind existing APIs. Ship with the multi-instance branch;
verify by watching `minute_ledger` sums against `minute_grants` after a day of
traffic.
