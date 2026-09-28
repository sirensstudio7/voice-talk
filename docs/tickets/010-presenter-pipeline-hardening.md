# TKT-010 — Presenter pipeline hardening (orphans, dormant features)

- **Status:** proposed
- **Priority:** P2
- **Area:** reliability
- **Effort:** M (2–4 days)
- **Depends on:** —
- **Source:** presenter feature audit, 2026-09-29

## Problem

Presentation processing is a fire-and-forget in-process job. If the API restarts
(or the instance is recycled) while a deck is `parsing` or `scripting`, the row
stays in that state forever: the UI shows a spinner, the merchant re-uploads, and
the deck never becomes `ready`. There is also a set of dormant features that were
built but never wired — script generation, pre-rendered WAV narration, and
embeddings — which makes the module harder to reason about than it needs to be.

## Evidence

- `apps/server/src/services/presentation-pipeline.ts` — module-level
  `running`/`cancelled` sets; no queue, no timeout sweep, no crash recovery.
- Dormant: `generateSlideScript` / `generateGreetingClosing`
  (`presentation-ai.ts`), `ensureSlideAudio` / `ensurePresentationStageAudio`,
  `presentation_embeddings` (chunks written with blank `embedding_reference`).
- UI relies on `processing_step` to render progress; a stuck row never leaves it.

## Proposal

1. **Orphan sweeper** (interval-locked, e.g. every 10 min): decks in
   `processing/parsing/scripting` older than 15 minutes are marked `failed` with
   a clear `processing_error` ("processing was interrupted — retry"), or
   automatically re-enqueued once. Expose `presenter.processing_stuck_total`.
2. **UI retry**: the deck detail page already has a Prepare button; ensure it is
   shown for `failed` decks with the error string.
3. **Decide the dormant paths, once**:
   - script generation: either wire it behind a flag or delete the dead functions;
   - per-slide audio: keep documented as "not used, live streaming instead" or
     delete;
   - embeddings: either adopt a vector path (pgvector) or rename the table to
     `presentation_chunks` and document keyword ranking as the design.

## Acceptance criteria

- [ ] Killing the API mid-processing leaves no deck stuck longer than 15 minutes.
- [ ] A failed deck can be retried from the UI and reaches `ready`.
- [ ] No exported-but-unused presenter helpers remain (or each has a comment
      explaining why it stays).

## Out of scope

- A real job queue (BullMQ/Redis streams) — only revisit if volume demands it.
- pgvector adoption (separate ticket if the keyword RAG proves insufficient).

## Rollout / risk

Sweeper is additive; dormant-feature decisions are code deletions or comments and
carry little risk.
