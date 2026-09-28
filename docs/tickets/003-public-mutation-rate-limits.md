# TKT-003 — Rate-limit public mutations + merchant login

- **Status:** proposed
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

- [ ] Burst tests hit 429 for each endpoint at the documented limit.
- [ ] Normal kiosk flows (a table of 4 visitors spinning once each) are unaffected.
- [ ] Metrics show denied counts per bucket.

## Out of scope

- CAPTCHA, WAF rules, or per-account quotas.
- Changing the fixed-window algorithm.

## Rollout / risk

Start limits high (2× expected peak), announce in the PR, watch
`rate_limit.denied_total` for a day; tune down if quiet.
