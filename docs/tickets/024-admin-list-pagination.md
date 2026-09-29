# TKT-024 — Admin list endpoints: SQL filtering and pagination

- **Status:** proposed
- **Priority:** P2
- **Area:** performance / data growth
- **Effort:** M (2–4 days)
- **Depends on:** TKT-008 (analytics SQL pass)
- **Source:** feature inventory review, extended in the DB audit 2026-09-29

## Problem

Some admin endpoints still load a full table into Node and filter or page in
JS. That is fine at demo scale and degrades linearly with history: response
time and memory grow with total rows, and each request holds a pool slot for
longer than it should. TKT-008 fixed the analytics aggregation; the list
endpoints have the same shape.

## Evidence

- `services/voice-minutes.ts` — `listPlatformTopupOrders` selects all orders
  (joined with users) then filters status/search in JS.
- `services/lucky-spin.ts` — winners search/pagination path (audit needed).
- `routes/admin/conversations.ts` — date-scoped lists; confirm counts and
  limits.
- `routes/admin/businesses.ts` — users list (audit needed).

## Proposal

1. Audit each admin list for `select *` + JS filtering.
2. Move filters, `count(*)` and `LIMIT/OFFSET` into SQL; return the same JSON
   shapes.
3. Add composite indexes only where the query plan asks for them (coordinate
   with TKT-026).
4. Keep a small default page size (e.g., 50) with explicit `limit`.

## Acceptance criteria

- [ ] No admin list endpoint loads an unbounded row set.
- [ ] Lists return < 100 ms with 100k+ rows and use an index (EXPLAIN).
- [ ] Response shapes unchanged (frontends untouched).

## Out of scope

- Cursor pagination, exports, search engines; changing the admin UI.

## Rollout / risk

Query-only changes behind the same APIs; watch `analytics.query_ms` style
timings per endpoint after deploy.
