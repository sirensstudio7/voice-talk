# TKT-016 — Roll the multi-instance branch to production

- **Status:** proposed — **blocked on operator access** (merge + Kubeletto deploy)
- **Priority:** P0
- **Area:** ops
- **Effort:** S (≤ 1 day)
- **Depends on:** merge of `feat/multi-instance-hardening` (or explicit approval to
  deploy the branch image)
- **Source:** multi-instance hardening work, 2026-09-29

## Problem

The multi-instance branch is verified in CI and locally but has never served
production traffic. Two-pod support is the goal, and the first rollout needs a
scripted sequence with rollback criteria rather than an ad-hoc flip.

## Preconditions

- Branch merged to `main` (or explicitly deployed from a branch-tip image such as
  `ghcr.io/sirensstudio7/voice-talk:sha-<branch tip>`).
- **Migrations 066–069 applied** before the new code serves traffic:
  `bun run seed:db` (066 python→auto, 067 appointment overlap constraints,
  068 share-token lifecycle, 069 analytics indexes).
  - If 067 aborts, production has overlapping appointments; it lists the ids.
    Cancel one of each pair and re-run. No overlap exists in the seed data.
- Kubeletto env: no `DB_POOL_MAX` override needed (code default 8 keeps two
  instances under a 20-connection plan); `REDIS_URL` is the Upstash `rediss://`.
- Optional env knobs if you want to tune before rollout:
  `ANALYTICS_RETENTION_DAYS` (180), `VISION_RETENTION_DAYS` (365),
  `PRESENTER_MAX_VIEWERS_PER_SESSION` (20).
- GHCR `latest`/`main` tags realigned if the branch was deployed out of band:
  re-run the API workflow on `main` from the Actions UI (or dispatch it), then
  confirm the image digest matches the merge commit.

## Rollout sequence

1. **Deploy burst capacity only:** `--min-instances 1 --max-instances 2 --wait`.
   Watch for 10 minutes.
2. **Verification matrix** (also in `docs/MULTI-INSTANCE.md`):
   - `GET /health?metrics=1` on both pods shows `kiosk_bus.subscribed: 1`.
   - `/menu` warm requests: `menu.request_ms.avg_ms` well under 300 ms and
     `menu.cache_hits_total` rising.
   - Voice call survives a pod kill: client reconnects without a tap, transcript
     preserved (`ws.connections_active` moves between pods).
   - Kiosk on pod A + an admin settings change → kiosk updates without a
     reconnect, and the new `/menu` payload appears within ~1 s.
   - Admin force-end with the session on the other pod closes it
     (`voice.force_end_remote_total` increments).
   - Two concurrent bookings for one slot → exactly one succeeds (409 for the
     loser) and `booking.slot_conflict_total` is 0 or small.
   - One voice session ends → the minute ledger matches the session duration
     (watch `minutes.debit_retry_total` stay 0).
   - All five greeting paths still answer: `bun scripts/ws-probe.ts --url
     wss://<api>/ws/session?business=<slug>` returns `RESULT: ok`.
3. **Raise to `--min-instances 2`** once step 2 is clean, and re-check
   `kiosk_bus.subscribed: 1` on both.
4. **LIVE tenants stay on one instance.** Starting a room while both pods are
   live now fails with a clear 409 (`services/instance-registry.ts`); do not
   override.

## Rollback

1. Kubeletto: redeploy the previous revision (the old image is pinned by digest).
2. App-level rollbacks are not needed for the schema: 066–069 are additive
   (columns, indexes, constraints); the previous code ignores them.
   - If the 067 constraints cause unexpected conflicts, drop them:
     `ALTER TABLE appointments DROP CONSTRAINT appointments_staff_no_overlap,
     DROP CONSTRAINT appointments_business_no_overlap;`
3. Scale back to `--max-instances 1` first; only then roll the image if the
   regression is code-level.

## Acceptance criteria

- [ ] Two pods running, `kiosk_bus.subscribed: 1` on both.
- [ ] Zero `server.unhandled_rejection` / `redis.*unavailable` warnings in the
      first hour.
- [ ] Rollback plan exercised in staging or documented with the exact
      Kubeletto deploy/rollback commands for this service (operator to fill in
      the CLI syntax if it differs from `kubeletto deploy/rollback`).

## Out of scope

- LIVE/presenter scaling beyond the guards (TKT-006/007).
- Autoscaling policy beyond min/max instances.

## Rollout / risk

Primary risk is an unnoticed cross-pod regression. Mitigate with the matrix
above and by keeping the previous revision available on Kubeletto for one-click
rollback; watch `/health?metrics=1` and `vision.*` logs for an hour.
