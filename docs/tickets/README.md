# Proposal tickets

One markdown file per proposed improvement. This is the working backlog for
technical, performance and reliability work — `docs/FEATURES.md` describes what
the product does, this directory describes what we intend to change and why.

## How to use

- **IDs are immutable.** `TKT-001` always means the same thing, even after the
  work ships. New work gets the next number.
- **One file per ticket**, named `<id>-<slug>.md`.
- **Update status in place** (`proposed → ready → in-progress → done`/`rejected`)
  and link the PR/commit when done. Never delete a ticket.
- **Read the template** before adding one: [`TEMPLATE.md`](TEMPLATE.md).
- Tickets are written to be agent-ready: enough evidence and acceptance
  criteria that someone (or an agent) can pick one up without a meeting.

## Index

| ID | Title | Area | Priority | Effort | Depends on |
|---|---|---|---|---|---|
| [TKT-001](001-atomic-voice-minute-debit.md) | Atomic voice-minute debit | money | P0 | S | — |
| [TKT-002](002-atomic-booking.md) | Atomic booking (no double-book) | booking | P0 | M | — |
| [TKT-003](003-public-mutation-rate-limits.md) | Rate-limit public mutations + merchant login | security | P0 | S | — |
| [TKT-004](004-force-end-fanout.md) | Fan out admin force-end across instances | multi-instance | P1 | S | — |
| [TKT-005](005-menu-cache.md) | Cache and parallelise `/menu` | performance | P1 | M | — |
| [TKT-006](006-live-multi-instance.md) | Decide LIVE's multi-instance model | architecture | P1 | L | — |
| [TKT-007](007-presenter-scaling-cost.md) | Presenter narration cost + viewer cap | architecture | P2 | M | — |
| [TKT-008](008-analytics-aggregation-retention.md) | SQL aggregation + retention for analytics | performance | P1 | M | — |
| [TKT-009](009-photo-branding-cache.md) | Cache photo branding assets | performance | P2 | S | — |
| [TKT-010](010-presenter-pipeline-hardening.md) | Presenter pipeline hardening (orphans, dormant features) | reliability | P2 | M | — |
| [TKT-011](011-frontend-ci-checks.md) | Frontend CI: typecheck + lint for all apps | tooling | P1 | M | — |
| [TKT-012](012-share-token-revocation.md) | Presentation share-token revocation | security | P2 | S | — |
| [TKT-013](013-dead-code-removal.md) | Remove dead code and legacy apps | maintenance | P2 | S | — |
| [TKT-014](014-ws-regression-tests.md) | Regression tests for prompts and WS contracts | testing | P1 | S | — |
| [TKT-015](015-latency-metrics.md) | Latency metrics (menu, first audio) | observability | P2 | S | TKT-005 |
| [TKT-016](016-multi-instance-rollout.md) | Roll the multi-instance branch to production | ops | P0 | S | merge of `feat/multi-instance-hardening` |
| [TKT-017](017-atomic-billing-writes.md) | Atomic, conflict-safe billing writes | money | P0 | S | TKT-001 |
| [TKT-018](018-order-confirm-idempotency.md) | Idempotent order confirmation | orders | P1 | S | — |
| [TKT-019](019-db-connection-timers.md) | Stop connection timers from killing DB queries | reliability | P0 | S | — |

Priority reflects business risk first, then user-visible performance, then
upkeep. Effort: S ≤ 1 day · M 2–4 days · L > 1 week.

## Open decisions (no ticket yet)

These need a product call before they become work:

- Payment gateway / email receipts (currently manual transfer + proof only).
- Member invitations and roles (only an owner role exists; all members can call
  every admin route).
- Platform-admin CRUD (admins are seed-only today).
- Presenter analytics export and operator controls (pause/next/previous are
  API-only).
