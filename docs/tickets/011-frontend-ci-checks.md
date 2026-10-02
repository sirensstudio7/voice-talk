# TKT-011 — Frontend CI: typecheck + lint for all apps

- **Status:** done (on `fix-fe-linter`; lint blocking on errors)
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

- [x] Every PR touching `apps/**` runs typecheck for the four apps and fails on
      errors (`.github/workflows/frontend.yml`, matrix over all four apps,
      blocking; all four are currently clean).
- [x] `tsbuildinfo` files are untracked and ignored (`*.tsbuildinfo`).
- [x] Lint runs blocking on errors with a documented decision (see workflow
      header): all four apps have working flat configs, zero findings, and the
      React Compiler rules enforced as errors (TKT-039 done on
      `fix-fe-linter`).
- [x] Workflow completes quickly: typecheck matrix only, bun install cache.

## Implementation notes

- `next build` is intentionally not part of PR checks; Vercel still builds, and
  tsc catches the type-level regressions the workflow is for. Add builds only if
  a real regression slips through.
- Follow-up decision recorded in the workflow, now resolved on `fix-fe-linter`:
  the two broken configs were migrated to `eslint.config.mjs` (not Biome), the
  React Compiler backlog was burned down in TKT-039, and the compiler rules are
  enforced again. Biome was left as an option if maintainers prefer it later.

## Out of scope

- Unit/E2E tests for the frontends (consider Playwright later).
- Vercel build changes.

## Rollout / risk

Non-blocking typecheck first (annotations) to avoid freezing unrelated PRs, then
make it required once a clean baseline is verified.
