# TKT-009 — Cache photo branding assets

- **Status:** in-progress (code on `feat/multi-instance-hardening`)
- **Priority:** P2
- **Area:** performance
- **Effort:** S (≤ 1 day)
- **Depends on:** —
- **Source:** feature inventory review, 2026-09-29

## Problem

Every Smart Photo Moment capture downloads the merchant's frame PNG and logo from
object storage before compositing. A busy kiosk pays two S3 round-trips per
photo, and a slow R2 moment directly delays the countdown → capture → success
flow the visitor is watching.

## Evidence

- `apps/server/src/services/photo-moment.ts` — branding (frame overlay + logo)
  is fetched from storage inside the capture/compositing path; no cache.

## Proposal

1. In-process TTL cache (10 minutes) keyed by `businessId` + asset path + ETag or
   `updated_at`, holding the decoded `Buffer`s.
2. Clear the entry when photo branding settings change (same-instance write), and
   on any `kiosk:broadcast` payload for the business so other instances refresh.
3. Metrics: `photo.branding_cache_hits_total` / `_misses_total`.

Safety: bound the cache (e.g., 100 businesses × 2 buffers) and skip caching
above a size threshold (frames are already constrained by the upload path).

## Acceptance criteria

- [x] Two consecutive captures for the same business hit storage once (unit
      test with a counting loader; production confirms via the new counters).
- [x] Updating the frame/logo is reflected on the next capture: the cache key
      embeds `photo_settings.updated_at`, so a change makes new keys.
- [x] Cache size is bounded and documented (100 entries, 4 MB per asset, 10 min
      TTL; `photo.branding_cache_hits_total` / `_misses_total`).

## Implementation notes

- `services/photo-asset-cache.ts` caches the *source* bytes keyed by
  `path#settingsVersion`; the per-capture resize still happens in
  `applyBranding`, so different capture sizes work unchanged.
- The loader is injectable, which is what the unit test uses instead of R2.

## Out of scope

- Reworking the branding pipeline or image sizes.
- CDN caching of public photo URLs.

## Rollout / risk

Additive and easy to disable (constant TTL 0). No schema or API changes.
