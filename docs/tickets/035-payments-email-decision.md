# TKT-035 — Payment gateway and email receipts (product decision)

- **Status:** proposed (decision)
- **Priority:** P3
- **Area:** product / payments
- **Effort:** L if adopted
- **Depends on:** —
- **Source:** open product decision recorded in the ticket README, 2026-09-29

## Problem

Top-ups and subscriptions are settled by manual bank transfer with an uploaded
proof, reviewed by a platform admin. There is no online payment and no email —
receipts, approval notices and password resets all rely on the customer being
logged in. This caps conversion and forces manual work per order.

## Options

- **A. Keep manual (current):** zero integration, acceptable while volume is
  low and/or all customers are onboarded personally.
- **B. Indonesian gateway (Midtrans/Xendit):** QRIS/VA/cards; webhook-driven
  top-up credit (the DB path already exists via `creditTopupOrder`); needs
  signature verification, idempotent webhook handling and a sandbox.
- **C. Stripe:** better for international cards; more friction for IDR/QRIS
  customers.

Email is orthogonal: a transactional provider (Resend/Postmark) unlocks
receipts, approval notifications and reset links regardless of A/B/C.

## Proposal

1. Product picks a gateway (or explicitly defers), and whether email is in
   scope.
2. If adopted: a new ticket for webhook endpoints (`POST /webhooks/<provider>`
   with signature check + idempotency on provider event id) building on the
   existing order-credit service, plus email templates and a reset flow.

## Acceptance criteria

- [ ] Decision recorded with the chosen provider (or a dated deferral).
- [ ] If adopted, cost per transaction and settlement time are documented.

## Out of scope

- Implementing the integration before the decision.

## Rollout / risk

Webhook endpoints are public and credit money: signature verification,
exactly-once processing and a reconciliation report are mandatory parts of any
implementation.
