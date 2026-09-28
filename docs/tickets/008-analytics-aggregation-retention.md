# TKT-008 — SQL aggregation + retention for analytics

- **Status:** in-progress (code + migration 069 on `feat/multi-instance-hardening`)
- **Priority:** P1
- **Area:** performance / data growth
- **Effort:** M (2–4 days)
- **Depends on:** —
- **Source:** feature inventory review, 2026-09-29

## Problem

Several dashboards load an entire business's event history into the Node process
and aggregate in JS. That is fine at demo scale and quietly fatal at growth:
response time degrades with every visitor, memory spikes on request, and nothing
ever deletes old rows. Vision metrics are the worst case (all `vision_events` for
a business, then filter by date in memory).

## Evidence

- `apps/server/src/services/vision-orchestrator.ts` — `getVisionMetrics()` does
  `select * from vision_events where business_id = $1` then filters in JS.
- `apps/server/src/services/campaign-banner.ts` — `getCampaignBannerAnalytics()`
  loads all impression/click events with no date bound.
- No retention job for `analytics_events` or `vision_events`; both grow forever.
  (`analytics_events` is deleted only with the workspace.)

## Proposal

1. Replace in-memory aggregation with SQL aggregation + date windows:
   `filter(created_at >= since)` + `group by event_type` / `event_name` counts in
   one query per dashboard.
2. Add missing indexes via migration:
   - `analytics_events(business_id, event_name, created_at)`
   - confirm `vision_events(business_id, created_at)` (exists from migration 010)
3. Add a retention job (interval-locked like the others): delete
   `analytics_events` older than 180 days and `vision_events` older than 365 days,
   configurable — or roll up into a daily aggregate table before deleting if the
   analytics dashboards ever need long history.
4. Metrics: `analytics.query_ms` observation per endpoint family.

## Acceptance criteria

- [x] Vision and banner dashboards aggregate in SQL with bounded windows and use
      the new composite indexes (`tests/analytics.test.ts` covers the vision
      path; banner grouping is by `metadata_json->>'banner_id'` in one query).
      A 1M-row timing check remains a post-deploy verification.
- [x] Retention job runs at most once per day across instances (shared interval
      lock), deletes in 5k-row batches, and reports counts in the log and on
      `/health?metrics=1`.
- [x] No dashboard regressions on seeded data (counts and CTR are computed the
      same way, just in SQL).

## Implementation notes

- Migration 069 adds `analytics_events(business_id, event_name, created_at)` and
  `vision_events(business_id, event_type, created_at)`.
- Vision metrics were loading every `vision_events` row for a business; now a
  `GROUP BY event_type` over the requested `days` window (default 7).
- Banner analytics loads grouped counts per `banner_id`/event over a 90-day
  window (was all-time, JS-parsed every row). Older data is outside retention
  anyway; a `days` argument exists if a longer window is wanted.
- Retention: `ANALYTICS_RETENTION_DAYS` (default 180) and
  `VISION_RETENTION_DAYS` (default 365), `services/analytics-jobs.ts`,
  metrics `analytics.retention_deleted_*`.

## Out of scope

- A BI warehouse / rollup tables (only if long history is required).
- Real-time analytics.

## Rollout / risk

Indexes first (non-breaking), then queries, then retention. Watch that retention
never touches data the platform MRR/minutes calculations rely on (they use
`voice_sessions`, not `analytics_events`).
