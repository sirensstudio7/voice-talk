# TKT-006 — Decide LIVE's multi-instance model

- **Status:** in-progress (guard + ADR on `feat/multi-instance-hardening`)
- **Priority:** P1
- **Area:** architecture
- **Effort:** L (> 1 week if option B/C)
- **Depends on:** —
- **Source:** multi-instance audit, feature inventory

## Problem

LORESCALE LIVE is a paid add-on, but its state is per-instance: room registry,
viewer counts, chat fanout, host loop and TTS cache all live in process memory,
and the AI host streams PCM from one Gemini Live connection per room. On two
pods, a viewer in the same room as the host can land on the other instance and
see no chat, no viewer count, no product highlight and no audio. We must either
declare LIVE single-instance officially (and make deployment obey it) or build
the cross-instance design — but not discover it live on a two-pod deploy.

## Evidence

- `apps/server/src/services/live.ts` — `rooms`, `hostTicks`, `hostCursor`,
  `lastAiAt`, `lastChatReplyAt`, TTS cache are module-level; `broadcastLive` /
  `broadcastLiveBinary` iterate local sockets only.
- `services/live-narrator.ts` — one Gemini Live connection per room, local.
- `docs/MULTI-INSTANCE.md` already lists LIVE as single-instance and the scaling
  checklist says not to enable it multi-instance.

## Options

**A. Keep LIVE single-instance (recommended now).** Document it, and add a boot
guard: when the instance detects a LIVE room with other pods running (or simply
an env `LIVE_SINGLE_INSTANCE=1`, default on), refuse to start the host loop and
log a clear error. Kubeletto deploys LIVE tenants with `max_instances: 1` (or a
separate service) until B/C lands.

**B. Room-owner lease + control fanout (mid).** Redis lease pins each room to one
instance; chat/viewer/product events fan out over `live:broadcast`; viewers on
other pods join the room's owner. PCM is the blocker: Redis Pub/Sub for 24 kHz
audio is ~50 frames/s per room and Upstash bills per command — unacceptable.
Media would need a different path (WebRTC relay or a dedicated media service),
which is really option C.

**C. Split LIVE into its own deployment (long).** A separate service with a
media-friendly transport (WebSocket relay/WebRTC), leaving the main API
stateless. Best end state; biggest investment.

## Proposal

1. Land option A now: single-instance guard + doc + deploy checklist per tenant.
2. Write the option B/C evaluation as an ADR in `docs/adr/` with the cost math
   for Upstash fanout vs a media relay, and decide when LIVE demand justifies it.

## Acceptance criteria

- [x] Turning on a LIVE room while `max_instances > 1` produces a loud,
      actionable error instead of a half-broken room: instances heartbeat in
      Redis (`services/instance-registry.ts`) and `startLiveSession` throws a
      409 naming the instance count (`tests/instance-registry.test.ts`).
- [x] `docs/MULTI-INSTANCE.md` and the deploy checklist say exactly how LIVE
      tenants are deployed today (single instance; guard fails fast otherwise).
- [x] ADR exists with the two viable designs and a recommendation:
      `docs/adr/0001-live-multi-instance.md` (option C — dedicated service with
      WebRTC/media relay — when LIVE demand justifies it).

## Implementation notes

- The heartbeat is one `SET … EX 45` per instance every 15 s (≈ 5.8k Upstash
  commands/month) and fails open on Redis errors so a outage cannot block LIVE
  on a single-instance deployment.
- `MULTI-INSTANCE.md` states the deployment constraint next to the LIVE row in
  the shared-vs-per-instance table.

## Out of scope

- Implementing fanout or a media relay in this ticket.

## Rollout / risk

The guard is defensive and can be relaxed later; no runtime behaviour changes for
single-instance deployments.
