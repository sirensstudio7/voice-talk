# TKT-003 — Rate-limit public mutations + merchant login

- **Status:** in-progress (code on `feat/multi-instance-hardening`)
- **Priority:** P0
- **Area:** security
- **Effort:** S (≤ 1 day)
- **Depends on:** —
- **Source:** feature inventory review, 2026-09-29

## Problem

The kiosk-unlock and platform-login endpoints are rate-limited through Redis, but
every other unauthenticated mutation is not: lucky-spin spins, public order
confirmation, appointment creation, photo session start/upload, campaign-banner
event posts. A single abuser can burn Gemini minutes (order confirm triggers
nothing, but spin/appointments write rows), pollute analytics, or stuff the
database. Merchant login is also unlimited, leaving password guessing to the
bcrypt cost alone.

## Evidence

- `rateLimit()` in `apps/server/src/redis.ts` is only called from
  `auth/platform-auth.ts` (`checkLoginRateLimit`) and
  `services/kiosk-displays.ts` (`checkKioskUnlockRateLimit`).
- Public mutations: `routes/public.ts`, `routes/lucky-spin.ts`,
  `routes/campaign-banner.ts` — no limiters.
- `routes/admin/auth.ts` login has no limiter.

## Proposal

Add a small, uniform limiter helper and apply it where identity is absent:

1. `rateLimitPublic(request, { bucket, limit, windowMs })` keyed by `ip + slug`
   using the existing fixed-window script; return the standard
   `{ detail }` 429 shape.
2. Defaults: spin 10/15 min per IP; order confirm 20/15 min; appointment create
   10/15 min; photo upload 20/15 min; banner events 120/min (kiosk refresh).
3. Merchant login: 10 attempts / 15 min per email+IP, mirroring the platform
   limiter; log and metric `auth.login_rate_limited_total`.
4. Expose `rate_limit.denied_total` (by bucket) on `/health?metrics=1`.

Limits must be generous enough for shared kiosk NAT: bucket by IP **and** slug,
and allow a kiosk display token to bypass per-IP spin limits if needed.

## Acceptance criteria

- [x] Burst tests hit 429 for each covered bucket
      (`tests/public-rate-limits.test.ts`: helper keying, merchant login, demo
      requests, lucky-spin).
- [x] Normal kiosk flows are unaffected: limits are per IP **and** slug and are
      sized at roughly 2× expected peak.
- [x] Metrics show denied counts per bucket
      (`rate_limit.denied_total` + `rate_limit.denied.<bucket>` on
      `/health?metrics=1`).

## Implementation notes

`src/http/rate-limit.ts` provides `allowPublicRequest(request, rule, scope?)`
(Redis fixed window shared by all instances, fails open, counts denials). Wired
limits, all per client IP plus scope:

| Endpoint | Scope | Limit |
|---|---|---|
| `POST /public/lucky-spin/:slug/spin` | slug | 30 / 15 min |
| `POST /businesses/:slug/orders/confirm` | slug | 20 / 15 min |
| `POST /businesses/:slug/appointments` | slug | 10 / 15 min |
| `POST /public/photo/session/start` | — | 20 / 15 min |
| `POST /public/photo/session/:id/upload` | — | 30 / 15 min |
| `POST /public/photo/session/:id/complete` | — | 20 / 15 min |
| `POST /public/photo/events` | — | 120 / min |
| `POST /public/campaign-banner/events` | — | 120 / min |
| `POST /public/demo-requests` | — | 5 / 15 min |
| `POST /admin/auth/login` | email | 10 / 15 min |

The kiosk-unlock and platform-login limiters are unchanged. Client IP comes from
the first `x-forwarded-for` hop (same convention as kiosk unlock); the edge is
expected to set it. Tune after watching `rate_limit.denied.*` for a day.

## Out of scope

- CAPTCHA, WAF rules, or per-account quotas.
- Changing the fixed-window algorithm.

## Rollout / risk

Start limits high (2× expected peak), announce in the PR, watch
`rate_limit.denied_total` for a day; tune down if quiet.
