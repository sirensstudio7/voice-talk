# TKT-005 — Cache and parallelise `/menu`

- **Status:** proposed
- **Priority:** P1
- **Area:** performance
- **Effort:** M (2–4 days)
- **Depends on:** kiosk bus (for invalidation)
- **Source:** production logs 2026-09-28 (`GET /menu` 1.6–2.3 s repeatedly), feature inventory

## Problem

`/menu` is the kiosk bootstrap payload — every tablet fetches it on load, wake,
reload and language change. Today it fans out to eight service calls with no
caching, and production logs show 1.6–2.3 s per request. On a slow connection
that is a visible black screen before the kiosk can even render.

## Evidence

- `apps/server/src/routes/public.ts` — `GET /menu` awaits `getBusinessBySlug`,
  `resolveCapabilities`, `getOrCreateVisionSettings`,
  `getSmartPhotoMomentPublicConfig`, `getLuckySpinPublicConfig`,
  `getCampaignBannerPublicConfig`, `getLanguagePackPublicConfig`,
  `getBookingPublicConfig` sequentially.
- Kubeletto logs: `method=GET path=/menu durationMs=1600..2310` on every kiosk
  fetch.
- Config changes already fan out over `kiosk:broadcast` (banners, spin, booking,
  vision), which gives us a ready-made invalidation signal.

## Proposal

Two layers, keeping the response shape identical:

1. **Parallelise** the service calls with `Promise.all` (they are independent
   reads) — safe even without caching.
2. **Per-instance cache** keyed by `slug` with a short TTL (45–60 s) and
   versioned invalidation:
   - Local mutations clear the entry directly (admin routes are same-instance for
     the write).
   - Any `kiosk:broadcast` payload for the slug clears the entry on every
     instance, so settings changes propagate instantly.
   - Add `menu.cache_hits_total` / `menu.cache_misses_total` to
     `/health?metrics=1`, and log a warn when an uncached build exceeds ~1 s.
3. Optional, only if needed after measuring: `ETag`/`Cache-Control` so kiosks can
   revalidate instead of refetching.

Alternatives: Redis-cached payload (adds Upstash commands for a hot path — worse
than instance memory at this scale); CDN caching (config changes would be stale
across kiosks — rejected).

## Acceptance criteria

- [ ] Warm `/menu` p95 < 300 ms in production logs.
- [ ] Changing a banner/spin/booking/vision setting is visible to a kiosk on any
      instance within ~1 s.
- [ ] Cache returns byte-identical payloads to the uncached path (contract test).

## Out of scope

- Reducing the number of service calls by merging queries (only if profiling says
  a single call still dominates).
- Client-side caching changes in the kiosk.

## Rollout / risk

Ship the parallelisation first (pure win), then the cache with a feature flag
(`MENU_CACHE=1`). Watch hit rate and staleness reports for a day.
