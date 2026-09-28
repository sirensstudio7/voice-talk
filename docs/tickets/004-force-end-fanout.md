# TKT-004 — Fan out admin force-end across instances

- **Status:** proposed
- **Priority:** P1
- **Area:** multi-instance
- **Effort:** S (≤ 1 day)
- **Depends on:** kiosk bus (`services/kiosk-bus.ts`), multi-instance branch
- **Source:** multi-instance audit, 2026-09-29

## Problem

"End conversation" in the merchant admin only works when the request lands on the
same API instance that hosts the voice socket. With two pods that is a coin
flip: the admin sees success, the conversation keeps running (and keeps billing
minutes) until the orphan sweep notices.

## Evidence

- `apps/server/src/services/voice-session-runtime.ts` keeps
  `activeVoiceSessions` in a module-level map.
- `routes/admin/conversations.ts` calls `forceCompleteVoiceSession(sessionId)`
  locally and returns whether it found the session.
- `docs/MULTI-INSTANCE.md` lists this as a known per-instance limitation.

## Proposal

Reuse the existing Redis fanout instead of adding a new channel:

1. Add payload type `voice.force_end` handled by `applyRemoteKioskPayload`
   (or rename the bus to a generic `control:broadcast` channel first — it already
   carries heterogeneous payloads).
2. Admin route: call `forceCompleteVoiceSession` locally; if it returns false,
   publish `{ type: "voice.force_end", voiceSessionId, reason: "admin" }`.
3. Every instance applies it to its local registry; the owning instance runs the
   normal completion path (Gemini shutdown, transcript flush, minute debit) and
   the audit entry is written once by the requesting instance.
4. Metric `voice.force_end_remote_total`.

## Acceptance criteria

- [ ] With the session on instance A and the admin request on instance B, the
      call ends within ~1 s and minutes are debited once.
- [ ] Unknown/stale session ids publish harmlessly (no error spam).
- [ ] Admin UI still reports "not found" when no instance owns the session.

## Out of scope

- Ending sessions that no longer have a live socket (the orphan sweep owns that).
- Admin force-end UI changes.

## Rollout / risk

Low: the payload is additive and ignored by instances without a matching
session. Ship with the multi-instance branch.
