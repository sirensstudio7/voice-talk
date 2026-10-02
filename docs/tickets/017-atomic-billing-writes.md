# TKT-017 — Atomic, conflict-safe billing writes

- **Status:** in-progress
- **Priority:** P0
- **Area:** money / multi-instance
- **Effort:** S (≤ 1 day)
- **Depends on:** TKT-001 (lot arithmetic), TKT-016 (2-pod rollout)
- **Source:** post-rollout review, 2026-09-29 — the last revenue race while two
  pods serve traffic

## Problem

TKT-001 made the lot arithmetic race-safe, but the surrounding write path is
still a sequence of independent statements:

`debitVoiceSession` → `expireStaleLots` → `ensurePeriodGrant` → `consumeLots(tx)`
→ `writeLedger`.

Two instances (and multiple kiosks sharing one owner account) can therefore:

1. **Lose a debit.** `ensurePeriodGrant` is check-then-insert on
   `uq_minute_grants_source`; the loser of a concurrent insert gets `23505`, the
   debit aborts before `consumeLots`, and there is no retry — the session is
   never charged.
2. **Charge without a ledger row.** `writeLedger` is check-then-insert on
   `idempotency_key`. If the ledger insert loses a race after lots were
   decremented, money moved with no audit entry.
3. **Crash halfway.** Because the steps are separate, any failure between them
   leaves a partial state that nothing reconciles.

`creditTopupOrder` has the same check-then-insert shape, so two admins approving
one order concurrently can surface a 500 (the unique constraint prevents the
double credit, but the request still fails).

## Evidence

- `apps/server/src/services/voice-minutes.ts` — `debitVoiceSession`,
  `ensurePeriodGrant`, `writeLedger`, `expireStaleLots`.
- `apps/server/src/services/voice-minutes.ts` — `creditTopupOrder`.
- Production runs 2 instances (`kubeletto services describe lorescale-api`).

## Proposal

1. Run the whole debit in one `db.transaction`: expiry, period grant, lot
   consumption and ledger entry either all commit or none do.
2. Make every insert idempotent with `onConflictDoNothing` and re-read the
   winner (`ensurePeriodGrant`, `creditTopupOrder`, `writeLedger`, expiry
   ledger rows).
3. Order every lot scan/update by `id` so concurrent transactions acquire locks
   in the same order (no deadlocks), and retry the debit transaction on
   `40001`/`40P01` (max 3 attempts) with the existing
   `minutes.debit_retry_total` counter.
4. Keep the ledger idempotency keys as the exactly-once contract.

## Acceptance criteria

- [x] Two concurrent `debitVoiceSession` calls for the same session both settle
      without error and produce exactly one `VOICE_USAGE` ledger row
      (`tests/billing.test.ts`).
- [x] Concurrent debits of two sessions for one account conserve seconds:
      `remaining + charged = granted`, no lot below zero (same file).
- [x] Concurrent wallet reads on a fresh account no longer throw on the period
      grant: `ensurePeriodGrant` and the lazy `account_subscriptions` auto-create
      are conflict-safe and re-read the winner.
- [ ] Logs show zero `billing.debit_failed` during the first production day
      after deploy.

## Implementation notes

- `debitVoiceSession` runs expiry → period grant → lot consumption → ledger in
  one transaction, retried up to 3× on `40001`/`40P01`.
- `ensurePeriodGrant`, `writeLedger`, `creditTopupOrder` and
  `ensureEntitlementForExistingUser` insert with `onConflictDoNothing()` and
  re-read (the last one was surfacing as a 23505 on concurrent first debits).
- `ensurePeriodGrant` resolves (insert or re-read) the current-period grant
  *before* clearing superseded lots, and never clears the row it resolved: the
  old "zero every subscription lot, then insert" order could zero a grant a
  concurrent caller had just created, losing the allowance with no charge (seen
  in CI as granted 18100 / sum 100; covered by the concurrent period-grant test
  in `tests/billing.test.ts`).
- Lot scans/updates are ordered by `id` so concurrent transactions lock in a
  deterministic order; the entitlement auto-create is materialized before the
  debit transaction so its nested writes cannot self-block on our locks.
- No schema change.

## Out of scope

- A durable retry/outbox for failed debits (safeDebitEndedSession currently logs
  and drops; a repair job is a separate decision).
- Reworking the lot/ledger model.

## Rollout / risk

Pure backend change behind existing APIs; no schema change. Ship with the next
image; watch `billing.debit_failed` and `minutes.debit_retry_total`.
