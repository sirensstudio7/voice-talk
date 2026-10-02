# TKT-038 — Presenter analytics export and operator controls

- **Status:** proposed (decision)
- **Priority:** P3
- **Area:** product / presenter
- **Effort:** M (2–4 days) if adopted
- **Depends on:** TKT-007 (viewer cap), TKT-010 (pipeline)
- **Source:** presenter feature audit, 2026-09-29

## Problem

Presenters produce valuable data (audience counts, questions, per-slide
engagement) but it only exists as a per-session JSON endpoint. There is no
export for a merchant to keep or share, and session control (pause, next,
previous) is API-only — an operator cannot steer a live session from the
dashboard if the presenter's own device fails.

## Proposal

1. If merchants ask for reporting: add CSV/JSON export for a presentation's
   sessions (audience counts, questions, durations) and a simple summary in
   the dashboard.
2. Surface audience count (the endpoint exists but is unused) in the live
   view.
3. Add operator controls in the admin live view wired to the existing
   `control` endpoint (pause/resume/next/previous).

## Acceptance criteria

- [ ] Export contains the documented fields and respects business scoping.
- [ ] Live view shows audience count; controls act within ~1 s.
- [ ] Decisions recorded; no dead endpoints left unlabeled.

## Out of scope

- AI-generated post-session reports; third-party analytics integrations.

## Rollout / risk

Read-mostly additions except controls, which are already implemented
server-side and audited; keep the API-only path working.
