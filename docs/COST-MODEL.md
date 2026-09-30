# Cost model

How much it costs to run the platform for a month, and what drives it.

Run the model: `node scripts/cost-model.mjs` (add `--json` for machine output).

Everything marked **measured** was verified against the live Gemini API on
2026-09-30, not copied from documentation. Everything marked **est** is an
assumption you can tune in the script.

---

## 1. The three mechanics that set the bill

These are not obvious from the docs and they dominate the cost.

### 1.1 The system instruction is re-billed on every single turn — **measured**

Live models have **no context caching**. `systemInstruction` is prepended to the
context and billed again on every model turn.

| Session | Turn 1 prompt tokens |
|---|---|
| 18-token system instruction | 560 |
| real merchant instruction (1,267 tokens) | 1,815 |

Difference = 1,255 ≈ the measured prompt size. A ten-turn conversation pays for
the merchant's menu, knowledge base and AI rules **ten times**.

Measured sizes from `buildSystemInstruction` (seeded Sunrise Coffee):

| Merchant | System instruction |
|---|---|
| Seed (10 products, 5 knowledge entries, custom rules) | **1,267 tokens** |
| Defaults only, no custom rules | 1,316 tokens |
| Heavy knowledge base (25 entries) | 2,003 tokens |

### 1.2 The assistant's own audio re-enters context as billable audio input — **measured**

Audio input costs **4x** text input ($3.00 vs $0.75 per 1M). The model's spoken
reply is retained as conversation history *as audio*, so every later turn
re-bills everything already said. Verified exactly:

```
audio_in(turn n) = 222 + sum(audio_out(1 .. n-1))
```

This makes cost grow **superlinearly with session length**:

| Session length | Rp per billed minute |
|---|---|
| ~30 s (greeting only) | 159 |
| ~1 min (short order) | 264 |
| ~2 min (real mean) | 168 |
| ~4 min (order + upsell) | 457 |
| ~8 min (heavy browse) | 795 |

A long session costs **4.7x** more per minute than a short one. Any flat
per-minute assumption will be wrong at one end of the range.

### 1.3 Wall-clock billing is free margin — **structural**

The platform bills the tenant by `ended_at - started_at`. Gemini only charges
for tokens. Every second of silence, VAD waiting, vision idle and turn latency
is **billed to the tenant and free to the platform**. This is why the real mean
session (112 s) costs less per billed minute than the turn-dense profiles above.

Do not "fix" long silences without re-running this model.

---

## 2. What the platform's own assumption says

`apps/server/src/routes/platform/subscriptions.ts:197` hardcodes:

```js
gemini_usd_per_minute = 0.023
```

That is Google's audio-only per-minute rate ($0.005 in + $0.018 out). It ignores
the system prompt entirely. Measured reality:

| | Rp per billed minute |
|---|---|
| Platform assumption | 380 |
| Real, typical order | 168 |
| Real, heavy browse | 795 |

**Verdict:** the constant is conservative for short sessions and optimistic for
long ones. It averages out at today's usage, but it cannot be used to model a
change in tenant behaviour — which is exactly what a cost model is for.

---

## 3. Real usage (from the 2026-09-28 production backup)

2,452 `voice_sessions` rows; 2,043 with both timestamps.

| Metric | Value |
|---|---|
| Total voice time | 3,749 min (62.5 h) |
| Median session | **10.8 s** |
| Mean session | 110.1 s |
| p75 / p90 / p99 | 77.6 s / 253 s / 1,222 s |
| Sessions hitting the 15 s floor | **54%** |
| Billable minutes under the platform rule | 3,997 min (+6.6% vs actual) |
| Sessions with any transcript row | 723 of 2,452 |

Caveats: the backup contains test and demo traffic (one session runs 98 minutes;
one transcript is an English university prospectus). Treat the shape as
indicative, not as a revenue baseline. Re-derive from a clean month before
pricing decisions.

---

## 4. Margin by plan

Assumes the full minute allowance is consumed, at the measured typical-order mix.

| Plan | Minutes | Gemini cost | Revenue | Gross margin |
|---|---|---|---|---|
| trial | 30 | Rp 5,025 | — | n/a |
| starter | 300 | Rp 50,254 | Rp 749,000 | **93.3%** |
| growth | 1,500 | Rp 251,270 | Rp 2,249,000 | **88.8%** |
| enterprise | 5,000 | Rp 837,567 | Rp 5,000,000 | **83.2%** |

### Stress test: tenants behave like heavy browsers

| Plan | Gemini cost | Revenue | Gross margin |
|---|---|---|---|
| starter | Rp 238,387 | Rp 749,000 | 68.2% |
| growth | Rp 1,191,937 | Rp 2,249,000 | 47.0% |
| enterprise | Rp 3,973,124 | Rp 5,000,000 | **20.5%** |

Voice minutes are not the risk. Even pathological usage stays profitable.

---

## 5. Add-on surfaces

Both add-ons sell for Rp 199,000/month, but their Gemini shapes are opposites.

### LORESCALE LIVE — flat, cheap, room-shared

One Live session per **room** (not per viewer), plus a text generation every
40 s while anyone is watching (`HOST_INTERVAL_MS`, `live.ts:1094`).

| Usage | Cost | Break-even |
|---|---|---|
| 1 h/mo | Rp 5,777 | **34 h/mo** |
| 30 h/mo | Rp 173,324 | 34 h/mo |
| 60 h/mo | Rp 346,648 | 34 h/mo |

Saleable comfortably. Cap streaming hours if you sell it to heavy users.

### AI Presenter — the expensive one

One Gemini Live session **per viewer** (`presenter-live.ts`), capped at
`PRESENTER_MAX_VIEWERS_PER_SESSION=20`. Every viewer re-bills the entire system
instruction on every slide cue.

| Deck | Cost |
|---|---|
| 30-min deck, 1 viewer | Rp 829 |
| 30-min deck, 5 viewers | Rp 4,146 |
| 30-min deck, 20 viewers | Rp 16,584 |

Cost scales **linearly with audience size** — 20 viewers cost 20x one viewer for
the identical deck. Still cheap in absolute terms, but the cap is enforced
per-instance in memory (`presentation-websocket.ts:149`), so N API replicas
raise the real ceiling to `20 x replicas`. TKT-031 (global cap) is unimplemented.

---

## 6. Revenue leakage — these cost more than Gemini does

Ranked by expected monthly impact. None of these are unit-economics problems;
they are accounting bugs.

| # | Leak | Where | Impact |
|---|---|---|---|
| 1 | **Lazy "active Starter" entitlement** — creates `status=active` with `ends_at=null`, so the account mints a fresh 300-min grant every calendar month, forever | `services/entitlement.ts:101-143` | Rp 50,254/mo Gemini cost + Rp 749,000/mo revenue per affected account, indefinitely |
| 2 | **Failed debit is dropped, never retried** — `safeDebitEndedSession` logs and swallows every error | `services/voice-minutes.ts:854-861` | Session is free, permanently |
| 3 | **Stale orphans bill zero** — sessions older than 20 min when the sweep sees them are closed unbilled | `voice-minutes.ts:560-572` | Up to 15 free minutes per incident |
| 4 | **No wallet reservation** — N kiosks can all pass the ≥15 s check, then later debits take `min(remaining, charge)` or nothing | `voice-minutes.ts:369-375` | Concurrent sessions after the wallet drains are free |
| 5 | **Reconnect = new billable session** — one socket is one session row; a kiosk reconnect is another 15 s floor | `routes/websocket.ts:210` | 54% of sessions already bill only the floor |

Note: `docs/FEATURES.md:28` still says "debit is not transactional". **That is
stale** — the debit is now wrapped in a transaction with `FOR UPDATE` lot locks
and serialization-failure retries (`voice-minutes.ts:467-505`). TKT-001/TKT-017
describe problems that are already fixed in the tree. Leaks #2–#4 are the ones
that remain.

---

## 7. Non-Gemini infrastructure

The `INFRA` array in `scripts/cost-model.mjs` is **placeholder-zeroed** because
the deploy docs target "any host". Fill it from real invoices. Line items that
actually exist today:

| Item | Source | Notes |
|---|---|---|
| Postgres | Aiven | `docs/DEPLOY.md:89` — free tier caps at **20 connections**; `DB_POOL_MAX` default 4 means 5 instances max |
| Redis | Upstash | rate limits + job locks + kiosk bus |
| Object storage | Cloudflare R2 | one bucket, prefixes per area; photo retention jobs prune |
| API container | any host | **needs always-on** — the docs warn free tiers that sleep drop voice WebSockets |
| Frontends x4 | any host | customer, admin, super-admin, marketing |

**Google Cloud, not unit-priced:** the current production key is on the Gemini
**free tier**. See §8.

---

## 8. The free-tier problem

`README.md:107` states "Voice provider: Gemini Live (free tier)". Measured
limits on that key:

| Limit | Value |
|---|---|
| Concurrent Live sessions | **6, project-wide** |
| Slot release after close | ~2.5 s |
| HTTP `generateContent` | 5 requests/min per model |
| Capacity guarantee | none — 503s observed before any quota was hit |
| Data use | content used to improve Google products; **human reviewers may read input and output** |
| DPA | unpaid quota is not covered |

Consequences for the model above:

- The cost figures in §4 assume **paid** pricing. On free tier the marginal cost
  is zero but the platform is capped at 6 simultaneous conversations shared
  across **all tenants and all four realtime surfaces**.
- Every price in this document is a *floor*, not the current spend.
- Business voice recordings are in scope for human review. That is a customer
  commitment problem, not a cost problem, and it blocks paying tenants.

---

## 9. How to use this model

1. Fill in `INFRA` with real invoices.
2. Re-measure `SYSTEM_PROMPT_TOKENS` if you change prompt builders — it is the
   single largest lever on cost, and it multiplies by turn count.
3. Re-derive the usage profile from a clean production month (exclude demos).
4. Before changing session length limits, silence timeouts, or the presenter
   viewer cap, re-run and check the stress-test table in §4.
5. Fix the leaks in §6 — they are worth more than any Gemini optimisation.

### Levers, in order of impact

| Lever | Effect |
|---|---|
| Shorten the system instruction | Linear reduction on every turn — 1,267 tokens x every turn |
| Reduce turns per session | Largest effect; audio accumulation is superlinear |
| Lower the presenter viewer cap | Linear on audience cost |
| Cap LIVE streaming hours | Protects the 34 h/mo break-even |
| Keep wall-clock billing | Silence stays free margin |
