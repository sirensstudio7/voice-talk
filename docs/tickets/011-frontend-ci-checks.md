# TKT-011 — Frontend CI: typecheck + lint for all apps

- **Status:** proposed
- **Priority:** P1
- **Area:** tooling
- **Effort:** M (2–4 days)
- **Depends on:** —
- **Source:** multi-instance branch work, 2026-09-29 — `tsc --noEmit` found real
  errors in super-admin that nothing in CI checks

## Problem

Only the API has CI. The four Next.js apps are type-checked (at best) by Vercel
during a build, so type errors and broken lint configurations reach `main`
silently. During this project, `tsc --noEmit` surfaced three real null-safety
errors in the super-admin kiosk-rules editor, and admin/super-admin ESLint is
non-functional under ESLint 9 (config migration pending). Tracked
`tsconfig.tsbuildinfo` build artifacts are committed and churn on every local
typecheck.

## Evidence

- `.github/workflows/api.yml` covers `apps/server` only.
- `apps/super-admin-app/src/app/(dashboard)/kiosk-rules/kiosk-rules-page-client.tsx`
  had `playbook is possibly null` errors (fixed separately).
- `apps/admin-app`, `apps/super-admin-app` — `eslint` exits with the ESLint 9
  flat-config migration error.
- `git ls-files '*tsbuildinfo'` → `apps/{admin,marketing,super-admin}-app/tsconfig.tsbuildinfo`
  are tracked.

## Proposal

1. Add `.github/workflows/frontend.yml`: install once, then a matrix over
   customer-app / admin-app / super-admin-app / marketing-app running
   `tsc --noEmit` (and `next build` only on `main`, to keep PR runs fast).
2. Fix lint:
   - Option A (recommended): adopt Biome for the frontends like the API
     (one config, fast, no ESLint 9 migration).
   - Option B: migrate the two broken configs to `eslint.config.mjs`.
   Lint runs in the same workflow, non-blocking at first (annotations), blocking
   after the backlog is cleared.
3. Untrack `*.tsbuildinfo` and add them to `.gitignore`.
4. Cache Bun/Next build artifacts between runs (`actions/cache` on `.next/cache`
   and `~/.bun/install/cache`).

## Acceptance criteria

- [ ] Every PR touching `apps/**` runs typecheck for the four apps and fails on
      errors.
- [ ] `tsbuildinfo` files are untracked and ignored.
- [ ] Lint runs (blocking or annotated) with a documented decision.
- [ ] Workflow completes in < 5 minutes on PRs.

## Out of scope

- Unit/E2E tests for the frontends (consider Playwright later).
- Vercel build changes.

## Rollout / risk

Non-blocking typecheck first (annotations) to avoid freezing unrelated PRs, then
make it required once a clean baseline is verified.
