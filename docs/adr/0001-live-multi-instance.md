# ADR 0001 — LIVE multi-instance model

- **Status:** accepted (interim)
- **Date:** 2026-09-29
- **Ticket:** TKT-006

## Context

LORESCALE LIVE is a paid add-on: a host streams video to viewers, an AI host
narrates, chats and highlights products. The implementation keeps room state in
process memory (`services/live.ts`: `rooms`, `hostTicks`, `hostCursor`,
`lastAiAt`, TTS cache) and runs one Gemini Live narration connection per room
(`services/live-narrator.ts`). Audio is streamed live as PCM.

The API is being made horizontal (two instances). Most features were made
multi-instance safe (config fanout, job locks, `/menu` cache, force-end fanout),
but LIVE is not: a viewer that lands on another instance sees no chat, no viewer
count, no product highlight, and no audio.

Fanning the PCM out over Redis Pub/Sub is not viable: 24 kHz audio is tens of
frames per second per room, and Upstash bills per command. A media relay (or
WebRTC) would be required — that is a service in its own right.

## Decision

**LIVE stays single-instance for now, and the API refuses to start a room when
more than one instance is running.**

- Every instance writes `instances:heartbeat:<id>` (TTL 45 s) every 15 s.
- `startLiveSession` checks the heartbeat count and throws a clear 409
  ("LIVE is single-instance but N API instances are running…") instead of
  silently starting a half-broken room.
- LIVE tenants are deployed with `max_instances: 1` until a multi-instance
  design ships. The rest of the product can still run two instances for LIVE
  tenants only if LIVE rooms are not started.

## Options considered

| Option | Verdict |
|---|---|
| A. Single-instance with an explicit guard (chosen) | Cheap, honest, protects room quality; costs a per-tenant deployment constraint |
| B. Room-owner lease + control fanout, PCM over Redis | Control messages are fine, PCM is not (command volume/cost); still needs a media path |
| C. Dedicated LIVE service with a media-friendly transport (WebRTC relay) | Correct end state, but a project rather than a ticket |

## Consequences

- Starting a LIVE room on a multi-instance deployment fails fast with an
  actionable error; no silent degradation.
- The presence check fails open when Redis is unavailable, so a Redis outage
  does not block LIVE on a single-instance deployment.
- Deployments must choose: horizontal API or LIVE. The `MULTI-INSTANCE.md`
  scaling checklist records this.

## Revisit when

- Two or more merchants run LIVE regularly (justifies option C), or
- A media relay/WebRTC vendor or service is added for other features anyway, or
- Gemini ships a shared-session fan-out that removes the per-room connection.

## References

- `apps/server/src/services/live.ts`, `services/live-narrator.ts`
- `apps/server/src/services/instance-registry.ts`
- `docs/MULTI-INSTANCE.md` — shared vs per-instance state
