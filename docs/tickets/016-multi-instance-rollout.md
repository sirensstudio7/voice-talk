# TKT-016 — Roll the multi-instance branch to production

- **Status:** proposed
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

- Branch merged to `main` (or explicitly deployed from
  `ghcr.io/sirensstudio7/voice-talk:sha-6c2c615`).
- Migration `066_retire_python_vision_source.sql` applied (`bun run seed:db`).
- Kubeletto env: no `DB_POOL_MAX` override (code default 8); `REDIS_URL` is
  `rediss://…` Upstash.
- GHCR `latest`/`main` tags realigned if the branch was deployed out of band.

## Rollout sequence

1. Deploy with `--min-instances 1 --max-instances 2 --wait` (burst capacity
   only). Watch for 10 minutes.
2. Verification matrix (also in `docs/MULTI-INSTANCE.md`):
   - `GET /health?metrics=1` on both pods shows `kiosk_bus.subscribed: 1`.
   - Voice call survives `kubectl` pod delete / `kill -TERM` (client reconnects
     without a tap, transcript preserved).
   - Kiosk on pod A + admin settings change → kiosk updates without reconnect.
   - Admin force-end works when the session is on the other pod (requires
     TKT-004; until then, skip and note).
   - Minute debits match ended sessions (no overspend) after a day.
3. Raise to `--min-instances 2` once step 2 is clean.
4. Keep `max_instances: 1` for any tenant running LIVE until TKT-006 lands.

## Acceptance criteria

- [ ] Two pods running, `kiosk_bus.subscribed: 1` on both.
- [ ] Zero `server.unhandled_rejection` / `redis.*unavailable` warnings in the
      first hour.
- [ ] Rollback plan exercised in staging or documented with exact
      `kubeletto rollback`/`deploy` commands.

## Out of scope

- LIVE/presenter scaling (TKT-006/007).
- Autoscaling policy beyond min/max instances.

## Rollout / risk

Primary risk is an unnoticed cross-pod regression. Mitigate with the matrix
above and by keeping the previous revision available on Kubeletto for one-click
rollback; watch `/health?metrics=1` and `vision.*` logs for an hour.
