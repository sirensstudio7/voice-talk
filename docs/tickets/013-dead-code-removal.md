# TKT-013 — Remove dead code and legacy apps

- **Status:** in-progress (code on `feat/multi-instance-hardening`)
- **Priority:** P2
- **Area:** maintenance
- **Effort:** S (≤ 1 day)
- **Depends on:** —
- **Source:** frontend/server audits, 2026-09-29

## Problem

Dead code makes every future change riskier to review: unused apps, unused
components and unused helpers read as "load-bearing" at a glance. New
contributors (and agents) waste context deciding whether they matter.

## Evidence (verified)

- `apps-legacy/` — old `customer-app` and `server` copies, not in the workspace
  config, not referenced by any script.
- Customer app: `manual-voice-mode.tsx`, `order-summary-panel.tsx`,
  `avatar-placeholder.tsx` are defined but never imported.
- `env.getPhotoDownloadBaseUrl` / `PHOTO_DOWNLOAD_BASE_URL` are defined but the QR
  flow uses `PUBLIC_API_URL` instead.
- Marketing `components/landing/pricing.tsx` (`PricingSection`) is never mounted.
- Super-admin `(dashboard)/add-ons` page is a "coming soon" placeholder and is not
  linked in the sidebar.

## Proposal

1. Delete `apps-legacy/` and its ignore rules.
2. Delete the unused customer components and the unused env helper (or wire the
   helper if it was intended — check with product first for the download domain).
3. Decide per item in the marketing/super-admin cases: delete or schedule as a
   real feature (pricing page, add-ons page) with its own ticket.
4. Add a `knip`-style unused-export scan (optional) or a short checklist in the
   PR template to keep it from regrowing.

## Acceptance criteria

- [x] No references remain: `avatar-placeholder.tsx`, `manual-voice-mode.tsx`,
      `order-summary-panel.tsx` and the `PHOTO_DOWNLOAD_BASE_URL` /
      `getPhotoDownloadBaseUrl` pair are deleted; grep, lint and typecheck are
      clean.
- [x] Deleted items are listed in the commit so reviewers can object.
- [x] "Keep for later" decisions are recorded as dormant in `docs/FEATURES.md`:
      the marketing pricing section, the super-admin add-ons placeholder, and
      the presenter script/audio helpers.

## Implementation notes

- `apps-legacy/` turned out to be **untracked** on this machine (only leftover
  `node_modules`, 59 MB) — nothing to remove from git; the local directory was
  deleted.
- The marketing `pricing.tsx` and super-admin `add-ons` page are kept as
  dormant (product decision pending), not deleted.

## Out of scope

- Deleting features that are merely unlinked but intended (pricing page, add-ons
  page) — those need a product call first.

## Rollout / risk

Pure deletions; one PR, easy to revert.
