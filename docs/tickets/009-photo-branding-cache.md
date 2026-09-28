# TKT-009 — Cache photo branding assets

- **Status:** proposed
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

- [ ] Two consecutive captures for the same business hit storage once (count via
      R2 request metric or log).
- [ ] Updating the frame/logo is reflected on the next capture (cache cleared).
- [ ] Cache size is bounded and documented.

## Out of scope

- Reworking the branding pipeline or image sizes.
- CDN caching of public photo URLs.

## Rollout / risk

Additive and easy to disable (constant TTL 0). No schema or API changes.
