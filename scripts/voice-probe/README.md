# Voice probes

Diagnostic scripts that measure the Gemini Live API directly. These are the
evidence behind the numbers in [`docs/COST-MODEL.md`](../../docs/COST-MODEL.md)
and [`docs/COST-V2-COMPARISON.md`](../../docs/COST-V2-COMPARISON.md) — run them
yourself rather than trusting the write-ups.

## Prerequisites

```bash
export GEMINI_KEY='...'   # from https://aistudio.google.com/apikey
bun install               # @voicetalk/shared must resolve
```

`prompt-size.ts` and `breakdown.ts` run with **no key** (they only build
prompts locally). The rest need a key.

> **These consume real quota.** Every Live probe opens a real session against
> `gemini-3.8-live` and is billed as such. `token-growth.mjs` alone opens two
> sessions with five turns each. On a **free-tier key the project is capped at
> 6 concurrent Live sessions**, and `concurrency-probe.mjs` deliberately walks
> into that wall. Use a paid key for anything except a quick sanity check.

## What each probe proves

| Script | Measures | Key finding |
|---|---|---|
| `live-probe.mjs` | One Live session end to end: connect, setup, TTFA, token accounting | Cold TTFA ~1.5s from connect; the session bills `promptTokenCount` per turn |
| `token-growth.mjs` | Prompt tokens across a multi-turn session, tiny vs real prompt | **The system instruction is re-billed every turn, and the model's own audio re-enters context as billable audio input** |
| `prompt-size.ts` | Token count of `buildSystemInstruction` for realistic merchants | Seeded merchant = **1,267 tokens**; heavy knowledge base = 2,003 |
| `breakdown.ts` | Contribution of each prompt component | Menu is only 17%, knowledge 9%; 74% is fixed scaffolding |
| `concurrency-probe.mjs` | How many simultaneous Live sessions the key allows | **6 concurrent, then WebSocket close 1011 with a quota reason** |
| `slot-vs-rate.mjs` | Concurrent cap vs per-minute creation cap | Rules out a creation-rate limit |
| `decisive.mjs` | Close *all* sessions, then reopen | Slots do free up — it is a concurrency cap, not a rate cap |
| `release-lag.mjs` | How long a closed slot takes to free | **~2.5s**, which is why an immediate reconnect can still be rejected |
| `warm.mjs` | Per-turn TTFA on a warm session; `thinkingLevel` handling | Warm TTFA 600-1200ms; `thinkingConfig.thinkingLevel` is **rejected** by `gemini-3.8-live` |

## Usage

```bash
export GEMINI_KEY='...'

bun  prompt-size.ts                  # no key needed
bun  breakdown.ts                    # no key needed
node live-probe.mjs                  # defaults to gemini-3.8-live
node live-probe.mjs gemini-3.1-flash-live-preview
node token-growth.mjs                # requires system-instruction.txt (see below)
node concurrency-probe.mjs gemini-3.8-live 16
node warm.mjs
```

`prompt-size.ts` writes `system-instruction.txt` next to itself; `token-growth.mjs`
reads that file. Run `prompt-size.ts` first, or generate it with a key to get the
exact token count.

## The measurements, in one place

Verified 2026-09-30 against `gemini-3.8-live`:

```
systemInstruction is re-billed on EVERY turn (Live models have no prompt caching)
  tiny prompt  -> turn-1 promptTokenCount = 560
  real prompt  -> turn-1 promptTokenCount = 1815   (delta 1255 ~= 1267 measured)

the model's audio output re-enters context as billable AUDIO input
  audio_in(turn n) = 222 + sum(audio_out(1 .. n-1))     verified exactly

concurrency
  6 concurrent Live sessions, 7th rejected with WS close 1011
  slot release lag ~2.5s

thinking
  thinkingConfig.thinkingLevel on gemini-3.8-live -> rejected, must be omitted
```

Audio is billed at 25 tokens/second. Prices used in the cost docs are Google's
paid-tier rates for `gemini-3.8-live`: text in $0.75/1M, audio in $3.00/1M,
text out $4.50/1M, audio out $12.00/1M.
