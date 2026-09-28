# TKT-007 — Presenter narration cost + viewer cap

- **Status:** proposed
- **Priority:** P2
- **Area:** architecture / cost
- **Effort:** M (2–4 days)
- **Depends on:** —
- **Source:** presenter feature audit, 2026-09-29

## Problem

Every connected presenter viewer — including anonymous shared-link viewers —
opens **its own Gemini Live narration session** and receives its own PCM stream.
There is no fan-out and no cap. A shared link posted in a group chat turns into
N concurrent Live sessions (and N bills) for one deck, and `/start` can create
unlimited parallel sessions from the same share token.

## Evidence

- `apps/server/src/routes/presentation-websocket.ts` — each socket calls
  `runPresenterLiveSession`; no shared room.
- `routes/presentations.ts` public share endpoints: `POST …/start` creates and
  auto-starts a new session per call; no session or viewer limit.
- PRD intent was one presenter session per deck; the implementation streams per
  viewer because audio was moved from pre-rendered WAVs to live Gemini.

## Proposal

Short term (this ticket):

1. **Viewer cap per session** (e.g., 20 concurrent narrator sockets; configurable
   per add-on) with a clear "room is full" close reason.
2. **Session cap per share token** (e.g., one live session per deck; subsequent
   `/start` joins the running one instead of creating another).
3. Metrics: `presenter.narrator_sessions_active` gauge,
   `presenter.viewers_rejected_total`, and a per-session count in the analytics
   endpoint.

Medium term (separate ticket if adopted): fan out one narrator stream to viewers
via a media-friendly relay (same blocker as LIVE — see TKT-006), or return to
pre-rendered per-slide audio (the dormant `ensureSlideAudio` path) where the cost
is per-deck, not per-viewer.

## Acceptance criteria

- [ ] Opening the 21st viewer is rejected with a friendly message; the 20th keeps
      playing.
- [ ] Two `/start` calls on one share token do not create two sessions.
- [ ] `/health?metrics=1` exposes the active-session gauge and rejection count.

## Out of scope

- Narration audio fan-out/relay (tracked with TKT-006).
- Billing presenters by viewer count.

## Rollout / risk

Caps are config; start generous, watch the metric, tune down. No protocol change.
