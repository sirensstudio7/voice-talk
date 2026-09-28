# TKT-014 — Regression tests for prompts and WS contracts

- **Status:** proposed
- **Priority:** P1
- **Area:** testing
- **Effort:** S (≤ 1 day)
- **Depends on:** —
- **Source:** the "singkat" incident (production greeting silently stopped
  answering for a week of changes) and the multi-instance branch

## Problem

The most expensive bugs in this product are silent: a prompt word that makes
Gemini return nothing, a `/menu` field that disappears, a WS message type that
stops being sent. None of these fail a build today.

## Evidence

- `gemini-3.1-flash-live-preview` returns no audio/transcript when a model-turn
  prompt contains the Indonesian word "singkat" — discovered by manual probing,
  fixed by rewording (`services/config-builder.ts`), documented in a comment.
- `/menu` is a large implicit contract (`docs/FEATURES.md` §11) consumed by the
  kiosk with optional chaining — a dropped field degrades silently.
- `tests/kiosk-bus.test.ts` shows the pattern for service-gated tests.

## Proposal

1. **Pure prompt-guard unit tests** (no services needed):
   - assert none of the Indonesian model-turn prompt builders
     (`buildSessionGreetingPrompt`, `buildVisionGreetingPrompt`,
     `buildVisionSilenceFollowUpPrompt`, `buildVisionGoodbyePrompt`) contain
     "singkat";
   - assert required phrases survive refactors (greeting mentions the assistant
     name, goodbye asks to end, etc.).
2. **`/menu` contract test** in the smoke suite (seeded DB): assert the top-level
   keys and the shape of `products`, `vision`, `capabilities`, `booking`,
   `lucky_spin`, `campaign_banner`, `languages`.
3. **A repo dev script** (`scripts/ws-probe.ts`) wrapping the manual probe used
   during diagnosis: connect to `/ws/session` with `session.greeting`, report
   first-audio latency and whether audio arrived — runnable against prod for
   smoke checks after deploys.

## Acceptance criteria

- [ ] Re-introducing "singkat" in an ID prompt fails `bun test`.
- [ ] A `/menu` shape regression fails the smoke suite in CI.
- [ ] `scripts/ws-probe.ts` documented in the README checks section.

## Out of scope

- Mocking Gemini for end-to-end voice tests (the probe covers the live path).
- Frontend component tests.

## Rollout / risk

Tests only; no runtime impact. The smoke additions run in the existing CI Redis/
Postgres service setup.
