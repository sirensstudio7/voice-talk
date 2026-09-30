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
| [TKT-020](020-redis-command-budget.md) | Cheaper Redis heartbeat + command accounting | cost | P1 | S | TKT-006 |
| [TKT-021](021-health-check-connection-churn.md) | Health checks reuse the pool (no connection per probe) | reliability | P1 | S | TKT-019 |
| [TKT-022](022-tenant-config-cache.md) | In-process tenant/entitlement config cache | performance | P1 | M | TKT-005 |
| [TKT-023](023-postgres-pooler.md) | Adopt a Postgres connection pooler (PgBouncer) when scaling | database | P2 | S | TKT-019/021 |
| [TKT-024](024-admin-list-pagination.md) | Admin list endpoints: SQL filtering + pagination | performance | P2 | M | TKT-008 |
| [TKT-025](025-load-test-harness.md) | Load/soak harness for kiosk, voice and booking bursts | testing | P2 | M | TKT-016 |
| [TKT-026](026-index-review.md) | Production index and query-plan review | performance | P3 | S | TKT-008/024 |
| [TKT-027](027-observability-hardening.md) | Observability: error aggregation + fleet metrics | observability | P2 | M | — |
| [TKT-028](028-auth-token-revocation.md) | Auth token revocation + cross-pod invalidation | security | P2 | M | TKT-020 |
| [TKT-029](029-storage-ssrf-guard.md) | SSRF allowlist for storage downloads | security | P2 | S | — |
| [TKT-030](030-trusted-client-ip.md) | Trusted client IP for rate limiting | security | P2 | S | TKT-003 |
| [TKT-031](031-global-presenter-cap.md) | Global presenter viewer cap via Redis (product-triggered) | cost | P3 | S | TKT-007/020 |
| [TKT-032](032-shared-aggregate-cache.md) | Redis-cached shared aggregates (platform dashboard) | performance | P3 | S | TKT-020/027 |
| [TKT-033](033-processing-queue-decision.md) | Processing queue decision (Redis Streams) — revisit trigger | architecture | P3 | M/L | TKT-010 |
| [TKT-034](034-retention-window-decision.md) | Confirm analytics retention + dashboard windows | product | P2 | S | TKT-008/016 |
| [TKT-035](035-payments-email-decision.md) | Payment gateway and email receipts | product | P3 | L | — |
| [TKT-036](036-member-roles-invites.md) | Member roles and invitations | product | P3 | M/L | TKT-035 |
| [TKT-037](037-platform-admin-management.md) | Platform-admin management: CRUD, roles, audit | product | P3 | M | TKT-028 |
| [TKT-038](038-presenter-analytics-export.md) | Presenter analytics export and operator controls | product | P3 | M | TKT-007/010 |
| [TKT-039](039-frontend-compiler-lint-burndown.md) | Burn down the frontend React Compiler lint backlog | tooling | P2 | M | TKT-011 |

Priority reflects business risk first, then user-visible performance, then
upkeep. Effort: S ≤ 1 day · M 2–4 days · L > 1 week.

## Decisions awaiting a product call

Tickets 034–038 are decision tickets: they need a product answer (or an
explicit deferral with a date) before implementation starts. They are listed in
the index above and each records the options and a recommendation.

