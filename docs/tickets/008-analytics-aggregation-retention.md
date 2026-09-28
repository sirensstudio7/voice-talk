# TKT-008 — SQL aggregation + retention for analytics

- **Status:** proposed
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

- [ ] Metric/vision/banner dashboards return in < 50 ms with a seeded 1M-row
      event table (query plan uses the indexes — verify with `EXPLAIN`).
- [ ] Retention job runs once per day across instances and reports deleted counts
      in the log.
- [ ] No dashboard regressions on seeded data (snapshot the current numbers
      before/after).

## Out of scope

- A BI warehouse / rollup tables (only if long history is required).
- Real-time analytics.

## Rollout / risk

Indexes first (non-breaking), then queries, then retention. Watch that retention
never touches data the platform MRR/minutes calculations rely on (they use
`voice_sessions`, not `analytics_events`).
