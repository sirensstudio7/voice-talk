# TKT-028 — Auth token lifecycle: revocation and cross-pod invalidation

- **Status:** proposed
- **Priority:** P2
- **Area:** security
- **Effort:** M (2–4 days)
- **Depends on:** TKT-020 (Redis budget)
- **Source:** security review 2026-09-29

## Problem

Access tokens are stateless JWTs with a long TTL and **no revocation**: logging
out, suspending a user or rotating a password does not invalidate an issued
token. User/access caches are per-instance with a 60s TTL, so a suspension
takes up to a minute per pod to take effect and longer if a token was cached.

## Evidence

- `auth/jwt.ts` — `clearUserCache` only clears the local process; no denylist.
- `auth/platform-auth.ts` — platform login has TOTP but the same stateless
  token model.

## Proposal

1. Add a `token_version` (or `jti` denylist) checked at authentication:
   - Redis-brokered version key per user, cache the version in-process for
     ~30 s so the hot path costs at most one Redis command per user per 30 s
     (budget-conscious, TKT-020).
   - Bump the version on logout, suspend, password change, role change.
2. Platform admin tokens: short TTL + refresh, or the same version check.
3. Document the tradeoff (staleness vs Redis commands) in `MULTI-INSTANCE.md`.

## Acceptance criteria

- [ ] Suspension/password change invalidates existing tokens on all pods
      within ~5 s in staging.
- [ ] Logout revokes the current token.
- [ ] Hot-path cost: ≤1 Redis command per user per cache window; no budget
      regression on `/health?metrics=1`.

## Out of scope

- OAuth/OIDC, refresh-token rotation, device management.

## Rollout / risk

Auth changes ship dark (version absent = current behavior) so existing tokens
keep working; watch `auth.*` logs and `redis.commands_rate_limit` style
counters for impact.
