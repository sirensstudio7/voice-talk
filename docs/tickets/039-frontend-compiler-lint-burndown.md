# TKT-039 — Burn down the frontend React Compiler lint backlog

- **Status:** proposed
- **Priority:** P2
- **Area:** tooling
- **Effort:** M (2–4 days)
- **Depends on:** TKT-011
- **Source:** `fix-fe-linter`, 2026-09-30 — 122 warnings left after the lint
  cleanup; React Compiler is not enabled in any frontend

## Problem

`eslint-plugin-react-hooks` v7 (shipped through `eslint-config-next` 16) enables
the React Compiler rules as errors. Two of them flag long-standing patterns
across all four frontends: `set-state-in-effect` (111 occurrences) and
`preserve-manual-memoization` (10 occurrences — admin only).

Fixing them all at once would mean rewriting data loading and effect patterns
across ~50 client components in one change. There are no frontend tests to
catch regressions, so `fix-fe-linter` fixed all other findings (including the
37 `react-hooks/refs` latest-value refs), demoted these two rules to warnings
in each `eslint.config.mjs`, and made CI lint blocking on errors only. The
warnings stay visible in every lint run so the backlog cannot disappear.

## Evidence

- `bun run --cwd apps/<app> lint` → 0 errors, 121 warnings (2026-09-30):
  admin 56 + 10, super-admin 29, customer 24, marketing 2.
- Dominant pattern: `useEffect(() => { void load(); }, [load])` where `load`
  is a `useCallback` that sets loading/data state. The rule flags any setState
  synchronously reachable from the effect body — including inside the called
  callback — so an effect-local async function or inline async IIFE is the
  shape the rule accepts.
- customer-app's share is mostly UI resets on close/visibility changes
  (`if (!open) setValue("")` and similar).
- `react.config.ts` / `next.config.ts` in all four apps: React Compiler off
  (no `reactCompiler` option).
- Prior context: TKT-011 migrated the two broken configs and made lint
  blocking; `fix-fe-linter` cleared every other rule category.

## Proposal

Adopt the compiler lint rules incrementally, app by app:
1. Add a small helper (or effect-local loaders) that satisfies the rule, then
   migrate the page clients that share the data-loading pattern.
2. Burn down per app — admin (66) and super-admin (29) are data-loading;
   customer (24) is UI resets; marketing (2) is one component.
3. When an app reaches zero, flip `set-state-in-effect` /
   `preserve-manual-memoization` back to `"error"` in that app's
   `eslint.config.mjs`; lint is already blocking.
4. Alternative considered: enable React Compiler and follow its adoption
   tooling. Deferred — without frontend tests the blast radius is too large,
   and the rules overlap with what the compiler would diagnose anyway.

## Acceptance criteria

- [ ] Zero `set-state-in-effect` and `preserve-manual-memoization` warnings in
      all four apps.
- [ ] Both rules back to `"error"` per app with CI lint green and blocking.
- [ ] Kiosk/voice flows smoke-tested (manual checklist or a future Playwright
      suite) after the customer-app changes.

## Out of scope

- Enabling React Compiler itself.
- Classic rules (exhaustive-deps, unused vars, …) — already enforced.
- Converting the codebase to Biome (TKT-011 option A) — only if the burn-down
  proves too costly.

## Rollout / risk

The warnings already ship; this is incremental internal cleanup, one app (one
page) per commit, normal review. Highest-risk area is the customer-app kiosk
session/voice effects — schedule it last or pair with a manual smoke test. No
runtime behaviour should change; if it does, that change is the bug.
