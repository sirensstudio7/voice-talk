# Running more than one API instance

VoiceTalk runs stateless HTTP on every instance; WebSocket connections are
pinned to whichever instance accepted them. This document lists what is shared,
what is per-instance, and the rules to keep scaling horizontal.

## Shared vs per-instance state

| State | Lives in | Safe across instances |
|---|---|---|
| Rate limits (login, kiosk unlock) | Redis (`redis.ts`) | ✅ shared window |
| Background-job locks | Redis interval buckets | ✅ one run per interval |
| Kiosk unlock leases | Postgres (`kiosk_displays`) | ✅ |
| Orders, sessions, analytics | Postgres | ✅ |
| Voice sessions / Gemini Live | instance memory + socket | per socket, restored by client |
| Vision hub (kiosk clients, session/cooldown) | instance memory | per instance, event-driven locally |
| Live rooms (`services/live.ts`) | instance memory | ⚠️ single-instance feature; room start refuses when >1 instance (TKT-006) |
| Admin "force end session" | instance memory | ✅ local, then `voice.force_end` fanout |
| `/menu` payload cache | instance memory | ✅ 45s TTL + bus/admin invalidation |

## Kiosk configuration fanout

Vision detection runs **in the kiosk browser**, on the same `/ws/kiosk` socket
as the control channel, so person/trigger events never cross instances.

Settings changes do cross instances:

1. Admin saves settings → `announceVisionConfigChange()` refreshes the local
   hub, pushes to local kiosks, and `PUBLISH`es on `kiosk:broadcast`.
2. `startKioskBus()` (started in `index.ts`) receives the payload on every
   instance, skips its own origin, and calls `applyRemoteKioskPayload()`.
3. `vision.config` is *rebuilt* from the receiving instance's hub (session
   state is per-instance); other payloads (banners, lucky spin, booking) are
   rebroadcast verbatim. `voice.force_end` is handled before the hub check so
   instances without a vision hub still close a locally hosted session.

The bus uses a dedicated Redis connection because Bun's client cannot run
normal commands while subscribed, and Bun does not auto-reconnect — the bus
reconnects with backoff and exposes `kiosk_bus.subscribed`.

Never route media or per-frame data through this channel; it is for small,
rare control payloads.

## Deploys and rolling restarts

On `SIGTERM` the server:

1. Sends `{type:"server.draining"}` and closes every socket with code `1012`.
   Close listeners run first, so hubs release sessions and voice sessions stop
   their Gemini stream.
2. Waits `SHUTDOWN_DRAIN_MS` (3 s) so clients can reconnect elsewhere.
3. Stops the HTTP/WS listener, the bus subscriber, Redis and the DB pool.

Client behavior:

- **Kiosk socket** reconnects after ~800 ms and re-acks an active session.
- **Voice socket** reconnects automatically on `1012`/`server.draining`
  (up to 3 attempts), preserving order + transcript via `session.restore`.
  If the greeting had not been heard yet it is re-requested; a mid-session
  kiosk call resumes listening.

Other disconnects keep the existing behavior (status `disconnected`, user
taps to reconnect).

## Background jobs

`withIntervalLock(name, intervalMs, job)` claims a time-bucket key
(`jobs:interval:<name>:<floor(now/interval)>`) that is **not** released when the
job returns. Two instances with different boot phases therefore cannot both
run a sweep in the same window. TTL is `interval + 30 s`; a crashed instance
never blocks the next bucket.

## Connection budget

- `DB_POOL_MAX` is per instance; keep `instances × DB_POOL_MAX` below the
  Postgres plan's connection limit (Aiven free = 20). Default is 4: two
  instances use 8, and a rolling deploy with both revisions live uses 16.
  Health checks and logins share the pool (TKT-021); no other client opens
  permanent connections.
- Postgres connections are held open deliberately: Bun's client
  `idleTimeout`/`maxLifetime` timers hard-fail in-flight queries instead of
  draining them (oven-sh/bun#30646, unmerged), so `db/client.ts` sets neither.
  The pool watchdog and `statement_timeout` handle wedged connections.

## Redis command budget

Upstash bills per command (500k/month on the free tier). Measured/estimated at
two pods, after TKT-020:

| Purpose | Rate | Commands/month |
|---|---|---|
| Instance heartbeat (`instances:heartbeat:*`) | 1/min/pod, TTL 150 s | ~86k |
| Redis health `PING` (60 s cache) | ≤1/min/pod | ~86k |
| Job interval locks (5 jobs, 5–60 min ticks) | ~20k/pod | ~29k |
| Rate limits (`EVAL` per public mutation/login) | request-bound | ~5–50k |
| Kiosk bus `PUBLISH` (+ deliveries) | settings changes only | negligible |
| **Total** | | **~210–260k** |

Rules of thumb:

- Before adding periodic Redis work, price it: `interval × pods × 43,200 min`.
- Prefer in-process caches invalidated by the kiosk bus over a shared Redis
  cache for small per-tenant config (no network hop, no commands).
- Never aggregate fleet metrics through Redis (~1M+ commands/month); read pods
  individually or use logs.
- `/health?metrics=1` exposes `redis.commands_total` and
  `redis.commands_<purpose>_total` so the budget is observable.

## Observability

`GET /health?metrics=1` returns in-process counters:

| Metric | Meaning |
|---|---|
| `ws.connections_active` | sockets on this instance (gauge) |
| `ws.drained_total` | sockets closed by deploy drains |
| `ws.session_setup_ms.*` | socket open → Gemini session connected (latency) |
| `ws.first_audio_ms.*` | greeting dispatch → first assistant audio (latency) |
| `kiosk_bus.subscribed` | subscriber connected (gauge) |
| `kiosk_bus.published_total` | fanout messages published |
| `kiosk_bus.received_total` | fanout messages received from peers |
| `kiosk_bus.publish_failed_total` | publish errors |
| `kiosk_bus.handler_failed_total` | remote payload apply errors |
| `redis.rate_limit_unavailable_total` | fail-open rate limits |
| `redis.job_lock_unavailable_total` | skipped job runs |
| `redis.commands_total` / `redis.commands.<purpose>_total` | client-side Redis command budget |
| `db.pool_reset_total` | Postgres pool recycles |
| `db.health_ping_total` | successful DB health probes |
| `rate_limit.denied_total` / `rate_limit.denied.<bucket>` | public request denials |
| `menu.cache_hits_total` / `menu.cache_misses_total` | `/menu` cache behaviour |
| `menu.request_ms.*` / `menu.build_ms.*` | `/menu` latency (all vs uncached builds) |
| `minutes.debit_retry_total` | conditional debit-update misses (should stay 0) |
| `booking.slot_conflict_total` | lost slot races mapped to 409 |
| `server.shutdowns_total` | SIGTERM shutdowns |

Latency metrics use a fixed bucket set (`*.le_50ms` … `*.le_5000ms` plus
`*.count`, `*.avg_ms`, `*.max_ms`), so p50/p95 can be estimated from the
snapshot without a histogram backend.

Log lines carry `instance` (pod name) and `version` (git sha), so an incident
can be tied to a specific instance and deploy.

## Scaling checklist

- [ ] Two instances: `kubeletto deploy lorescale-api --min-instances 1 --max-instances 2`
- [ ] `DB_POOL_MAX ≤ 4` when running 2 instances against a 20-connection plan
      (worst case is a rolling deploy with both revisions live: 4 pods × 4 = 16)
- [ ] Rolling restart test: active voice call + kiosk session survive a pod kill
- [ ] Kiosk on instance A + settings change → kiosk updates without reconnecting
- [ ] `/health?metrics=1` on both instances shows `kiosk_bus.subscribed: 1`
- [ ] Live rooms are not enabled on multi-instance deployments — starting one
      now fails with an actionable 409 (`services/instance-registry.ts`); see
      `docs/adr/0001-live-multi-instance.md` for the revisit conditions
