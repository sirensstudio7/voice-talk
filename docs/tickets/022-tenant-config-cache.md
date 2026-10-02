# TKT-022 — In-process tenant/entitlement config cache

- **Status:** proposed
- **Priority:** P1
- **Area:** performance / database
- **Effort:** M (2–4 days)
- **Depends on:** TKT-005 (menu cache invalidation hooks), TKT-019/021 (pool)
- **Source:** DB connection audit after TKT-019, 2026-09-29

## Problem

`getBusinessBySlug` runs on **every public request** (`/menu`, order confirm,
appointments, photo, voice websocket) and does 5+ queries, including
`hasServiceAccessForBusiness` → a full entitlement snapshot (subscription
status, plan, workspace count, pending request, status refresh). With 4 pool
slots per pod, a kiosk boot burst can occupy them all for several queries
each; latency and pool queuing follow.

## Evidence

- `services/tenant.ts` — `getBusinessBySlug` loads business, entitlement,
  products, knowledge entries and AI rules.
- `services/entitlement.ts` — `getEntitlementSnapshot` performs multiple reads
  and a status refresh; `hasServiceAccessForBusiness` wraps it.
- `docs/MULTI-INSTANCE.md` — `DB_POOL_MAX` is 4; the goal is fewer queries per
  request, not more connections.

## Proposal

In-process caches with the invalidation fabric we already run:

1. `services/tenant-cache.ts`: slug-keyed `Map` of the
   `BusinessWithRelations` payload, TTL 45s, single-flight promise dedupe so a
   cold key builds once.
2. Invalidate on the same events as `menu-cache`: every
   `broadcastKioskPayloadLocally` (bus payload on each instance) and the admin
   business/product/knowledge/AI-rules/appearance/profile write hooks.
3. Entitlement snapshot cache keyed by `userId`, TTL 15s, invalidated on
   subscription approval and add-on changes; the **billing path stays
   uncached** (wallet and lots always read live).
4. Counters `tenant.cache_hits_total` / `tenant.cache_misses_total` and the
   existing menu counters prove the effect.

Deliberately **not** Redis: an Upstash `GET` costs 10–40 ms and one command to
cache a row a local query returns in 1–5 ms. Two pods are cheap to invalidate
over the bus.

## Acceptance criteria

- [ ] Two consecutive public requests hit the DB once (verify with
      `pg_stat_statements`/logs before and after).
- [ ] Admin edits (business, products, AI rules, entitlement) are visible
      within ~1 s on both instances.
- [ ] Missed bus messages bound staleness at the TTL; wallet/lots remain live.
- [ ] Cache entries are bounded (Map size cap) and logs warn on slow rebuilds.

## Out of scope

- Redis-shared caches; caching wallet/lots/ledger; changing entitlement logic.

## Rollout / risk

Pure read caching with invalidation; ship with the next image. Watch
`tenant.cache_misses_total` and the DB pool reset counter after deploy.
