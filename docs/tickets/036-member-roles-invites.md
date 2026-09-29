# TKT-036 — Member roles and invitations (product decision)

- **Status:** proposed (decision)
- **Priority:** P3
- **Area:** product / access control
- **Effort:** M–L if adopted
- **Depends on:** TKT-035 for email invites (optional)
- **Source:** open product decision recorded in the ticket README, 2026-09-29

## Problem

Roles are effectively binary today: the owner is special-cased for billing and
workspace deletion, and every other `business_members` row can call all admin
routes (products, staff, conversations, settings, add-ons). Inviting a
colleague means sharing credentials or manual DB work; there is no invite
flow, no viewer/staff role, and no audit of who changed what.

## Proposal

1. Define roles (e.g., `owner`, `manager`, `staff`, `viewer`) with a route
   permission matrix (billing/add-ons/workspace delete = owner only; settings
   = manager+; day-to-day = staff+; conversations read = viewer+).
2. Add invitations: token-based link (email delivery depends on TKT-035) or
   copyable code, single-use, expiring; accept flow creates the membership.
3. Enforce in one place (`requireBusinessAccess` + a role check helper) and
   audit role/invite changes.

## Acceptance criteria

- [ ] Permission matrix written and agreed; every admin route mapped.
- [ ] Invite/accept/revoke flows work without manual DB access.
- [ ] Role changes are audited and take effect immediately on all pods.

## Out of scope

- SSO; external identity providers; customer-facing accounts.

## Rollout / risk

Enforcement changes can lock people out — ship permissively (unknown role =
manager), announce, then tighten. Existing members default to `manager`
initially.
