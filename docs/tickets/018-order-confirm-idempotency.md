# TKT-018 — Idempotent order confirmation

- **Status:** in-progress
- **Priority:** P1
- **Area:** orders / correctness
- **Effort:** S (≤ 1 day)
- **Depends on:** —
- **Source:** post-rollout review, 2026-09-29

## Problem

`POST /businesses/:slug/orders/confirm` creates a new order every time it is
called. The kiosk disables the button while a request is in flight, but the
classic failure still happens: the request reaches the server, the response is
lost (timeout, reload, flaky venue Wi-Fi), the customer taps again, and the
merchant gets a duplicate order to cancel by hand.

## Evidence

- `apps/server/src/routes/public.ts` — order confirm builds a snapshot and
  inserts, with no request key.
- `apps/server/src/services/order-persistence.ts` — `persistConfirmedOrder`
  always inserts.
- `apps/customer-app/src/lib/order-api.ts` — no idempotency header; the retry
  after an ambiguous failure is treated as a new order.

## Proposal

1. Migration 070 adds `orders.client_request_id` with a partial unique index
   `(business_id, client_request_id) WHERE client_request_id IS NOT NULL`.
2. `persistConfirmedOrder` accepts an optional client request id and, when
   present, returns the existing order instead of inserting. Order + items are
   written in one transaction; a `23505` loser re-reads the winner.
3. The public route accepts the key from the `Idempotency-Key` header (or an
   `idempotency_key` body field), validates it (`^[A-Za-z0-9._:-]{8,64}$`) and
   maps invalid values to a 400.
4. The customer app generates one key per checkout signature (business + items)
   in `sessionStorage`, reuses it across retries/reloads, and clears it on
   success — so a fresh identical order later still creates a new order.

## Acceptance criteria

- [x] Two concurrent confirms with the same key create exactly one order and
      both calls return its id (`tests/order-idempotency.test.ts`).
- [x] A different key creates a new order (same file).
- [x] Requests without a key behave exactly as before (smoke contract test in
      `tests/smoke.test.ts` plus the no-key service test).
- [x] The customer app sends the header and reuses the key across retries
      (`apps/customer-app/src/lib/order-api.ts`).

## Implementation notes

- Migration 070: `orders.client_request_id` + partial unique index on
  `(business_id, client_request_id) WHERE client_request_id IS NOT NULL`.
- `persistConfirmedOrder` takes `clientRequestId`, writes order + items in one
  transaction, and returns `replayed: true` with the existing order when the
  key was already used (including the concurrent-loser path via `23505`).
- The public route reads `Idempotency-Key` (or `idempotency_key`), validates
  `^[A-Za-z0-9._:-]{8,64}$`, and returns 400 for a supplied-but-invalid key.
- The customer app keeps one key per business+items signature in
  `sessionStorage`, so retries and reloads reuse it and it is cleared on
  success (a later identical order is not deduplicated).

## Out of scope

- Idempotency for the voice `confirm_order` tool path (the voice session is
  already the de facto key; revisit only if duplicates are observed).
- Idempotency on other public mutations.

## Rollout / risk

Additive column/index; old code ignores it. Ship with the next image. Watch
`orders` for duplicate rows per kiosk session for a day.
