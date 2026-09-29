# TKT-037 — Platform-admin management: CRUD, roles and audit

- **Status:** proposed (decision)
- **Priority:** P3
- **Area:** product / platform admin
- **Effort:** M (2–4 days) if adopted
- **Depends on:** TKT-028 (token lifecycle) for safe offboarding
- **Source:** open product decision recorded in the ticket README, 2026-09-29

## Problem

The super-admin account is seed-only (`PLATFORM_ADMIN_EMAIL`), with a single
`super` role and no management UI. Adding a second admin, rotating access or
offboarding someone means database work; audit entries exist for many platform
actions but not for admin-account management itself.

## Proposal

1. If more than one platform operator is needed: add a super-admin "Team" page
   (list/invite/disable), roles (`super`, `operations`, `support`), and
   enforce them per route group.
2. New admins get an invite/temporary credential flow (email depends on
   TKT-035); disablement bumps the token version (TKT-028).
3. Audit admin-account changes (who invited/disabled whom).

## Acceptance criteria

- [ ] Platform admins can be added/disabled without DB or CLI access.
- [ ] Route permissions per role are documented and enforced.
- [ ] Disabling an admin revokes their sessions within ~5 s.

## Out of scope

- Merchant-side roles (TKT-036); SSO.

## Rollout / risk

Keep the seeded super admin as break-glass (env-provided), protected from
deletion; log every admin-management action.
