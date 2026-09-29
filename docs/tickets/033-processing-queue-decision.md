# TKT-033 — Processing queue decision (Redis Streams) — revisit trigger

- **Status:** proposed (decision)
- **Priority:** P3
- **Area:** architecture
- **Effort:** M–L if adopted
- **Depends on:** TKT-010 (stuck-deck sweep)
- **Source:** presenter/photo pipeline review 2026-09-29

## Problem

Presenter preparation, TTS generation and Smart Photo Moment processing run
in-process, fire-and-forget. A deploy or crash mid-job loses the work; TKT-010
recovers by marking stale decks failed so the merchant retries, and photo jobs
retry on the next tick. That is acceptable at current volume, but it is a
deliberate limitation, not a design that scales.

## Options

- **A. Stay in-process (current):** zero infrastructure cost; recovery via
  sweeps and retries. Fails when processing volume or user expectations rise.
- **B. Redis Streams + a worker loop in the same image:** durable job queue,
  `XADD`/`XREADGROUP`/`XACK` (~4–6 commands per job — trivial at deck volumes),
  survives deploys, natural retry/backoff. Adds consumer-group operations to
  the runbook.
- **C. BullMQ:** richer, but a new dependency and another Redis key space; the
  needs here are small.

## Decision trigger

Adopt B when any holds: > ~50 presentations/day, a deploy visibly loses a job
in production, or photo processing needs retry semantics beyond the current
tick.

## Acceptance criteria

- [ ] Trigger is measurable (deck/photo job counts logged).
- [ ] If adopted: jobs survive a restart, retries are bounded and observable,
      and the stuck-deck sweeper becomes a safety net rather than the recovery
      mechanism.

## Out of scope

- Changing where media is stored; moving Gemini calls off the API.

## Rollout / risk

Queue adoption is a contained change behind the pipeline service; keep the
sweeper either way.
