# TKT-030 — Trusted client IP for rate limiting

- **Status:** proposed
- **Priority:** P2
- **Area:** security
- **Depends on:** TKT-003 (public rate limits)
- **Source:** security review 2026-09-29
- **Effort:** S (≤ 1 day)

## Problem

Rate limits key on the **first** `X-Forwarded-For` hop. If Kubeletto's edge
appends the client IP instead of overwriting the header, a client can send
`X-Forwarded-For: <random>` and get a fresh budget per request — the limits
become advisory against a determined abuser. The kiosk-unlock limiter has used
the same convention since before this project.

## Proposal

1. Determine the edge behavior empirically: send two requests with different
   `X-Forwarded-For` values to a limiter endpoint and observe whether the
   budget is shared (edge overwrites/ignores) or per-value (edge appends).
2. Centralize IP extraction in `requestIp()` (`http/rate-limit.ts`):
   - prefer a platform-provided header if Kubeletto sets one (`x-real-ip`,
     `cf-connecting-ip`), else
   - use the right-most non-private `X-Forwarded-For` entry (the hop the edge
     observed), not the client-supplied left-most.
3. Apply the same helper to kiosk unlock and platform login limiters.
4. Document the trust assumption in `docs/MULTI-INSTANCE.md`.

## Acceptance criteria

- [ ] Spoofed `X-Forwarded-For` cannot reset a limiter budget (test with two
      different spoof values summing to the limit).
- [ ] Real kiosk traffic behind shared NAT still shares one budget per
      venue/IP as intended.
- [ ] One helper used by every limiter.

## Out of scope

- IP reputation services, CAPTCHA, WAF rules.

## Rollout / risk

Changing the extraction can regroup existing keys (one-time burst of fresh
budgets). Deploy during a quiet window and watch `rate_limit.denied.*`.
