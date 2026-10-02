# TKT-007 — Presenter narration cost + viewer cap

- **Status:** in-progress (code on `feat/multi-instance-hardening`)
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

- [x] Opening the (cap+1)th viewer is rejected with a friendly message; earlier
      viewers keep playing: `PRESENTER_MAX_VIEWERS_PER_SESSION` (default 20),
      slot counter in `routes/presentation-websocket.ts`, unit tested in
      `tests/presenter-cap.test.ts`.
- [x] Two `/start` calls on one share token do not create two sessions: the
      second joins the running (non-completed) session and returns it with 200.
- [x] `/health?metrics=1` exposes `presenter.narrator_sessions_active`,
      `presenter.viewers_active` (gauges) and
      `presenter.viewers_rejected_total`.

## Implementation notes

- The cap is per API instance; with the current per-instance room scale that is
  the right unit (each socket is an independent Gemini session regardless of
  which pod it lands on). If a global cap is ever needed, move the counter to
  Redis.
- Medium-term fan-out/pre-render decision stays with TKT-006 option C; the
  dormant per-slide audio helpers are kept for that evaluation (TKT-010).

## Out of scope

- Narration audio fan-out/relay (tracked with TKT-006).
- Billing presenters by viewer count.

## Rollout / risk

Caps are config; start generous, watch the metric, tune down. No protocol change.
