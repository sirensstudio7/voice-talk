# TKT-034 — Confirm analytics retention and dashboard windows (product)

- **Status:** proposed (decision)
- **Priority:** P2
- **Area:** product / data
- **Effort:** S (decision)
- **Depends on:** TKT-008 (retention job), TKT-016 (rollout)
- **Source:** TKT-008 implementation review 2026-09-29

## Problem

Two defaults silently change what merchants see once the analytics work ships:

1. **Retention:** the daily job deletes `analytics_events` older than
   `ANALYTICS_RETENTION_DAYS` (default 180) and `vision_events` older than
   `VISION_RETENTION_DAYS` (default 365). On first run this permanently deletes
   any older history.
2. **Banner analytics window:** the dashboard aggregates the last 90 days
   (was all-time) to stay index-friendly.

Neither has been confirmed by product, and merchants have no notice.

## Proposal

1. Decide the real retention requirements per event family (e.g., 180/365 vs
   longer vs rollups for long history).
2. Decide whether banner/vision dashboards should state their window in the UI
   ("last 90 days") — recommended, since an unlabeled change looks like data
   loss.
3. Set the chosen values in Kubeletto env and document them in `DEPLOY.md`.
4. If longer history is required, adopt daily rollup rows before deletion
   (out of scope here; new ticket if chosen).

## Acceptance criteria

- [ ] Written sign-off on retention days and dashboard windows.
- [ ] Env values set in production (or defaults explicitly accepted).
- [ ] UI labels the time window where numbers changed.

## Out of scope

- The retention implementation (done in TKT-008); rollup tables.

## Rollout / risk

Decide **before** the first production retention run; deleting is
irreversible. Until then, production keeps the old image, so nothing is lost
yet.
