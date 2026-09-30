# v1 vs v2 architecture: cost comparison

Compares the shipped architecture (**v1** — Gemini Live native audio) against the
proposed cascaded pipeline (**v2** — Deepgram STT → Groq/Gemini LLM → Cartesia
TTS on LiveKit).

Run it: `node scripts/cost-compare.mjs` (add `--json`).

v1 mechanics are **measured** (see [COST-MODEL.md](COST-MODEL.md)). v2 vendor
rates are public list prices as of Sept 2026 and must be re-verified before any
commitment.

---

## Headline

On the platform's **real traffic mix**, v2 costs **1.96x** v1.

| Session shape | Share of traffic | v1 | v2 | Delta |
|---|---|---|---|---|
| abandoned (median 10.8 s) | 54% | Rp 20 | Rp 47 | +136% |
| greeting only (~22 s) | 16% | Rp 60 | Rp 174 | +192% |
| short order (~48 s) | 18% | Rp 211 | Rp 416 | +97% |
| typical order (~112 s) | 10% | Rp 313 | Rp 771 | +146% |
| long order (~228 s) | 2% | Rp 1,687 | Rp 1,840 | +9% |
| **blended** | | **Rp 123** | **Rp 242** | **1.96x** |

Weights are taken from the production backup distribution.

> **Correction.** An earlier revision of this document used an estimated
> $0.015/min for LiveKit Cloud. The published rate is **$0.0100 agent session
> minute + $0.0005 WebRTC minute = $0.0105**, and the agent minute already
> includes orchestration hosting. Every figure below has been recalculated.
> The conclusion is unchanged; the magnitude is smaller (2.45x -> 1.96x).

---

## Why: the cost basis inverts

This is the single most important structural difference, and neither design
document states it.

| | v1 (native audio) | v2 (cascaded) |
|---|---|---|
| What you pay for | **tokens generated** | **minutes connected** |
| Silence | **free** | **billed** (STT + SFU stream) |
| System prompt | re-billed every turn, no caching | cached, ~10-50% |
| Conversation history | audio, re-billed at 4x text | text, cheap |
| Cost curve | superlinear (audio accumulates) | linear (per-minute) |

v1 charges for thinking. v2 charges for *being connected*. For a kiosk that sits
waiting for a visitor, that is the wrong axis.

---

## Where v2's money actually goes

Typical 112 s order:

| Component | Cost | Share |
|---|---|---|
| LiveKit Cloud (agent minute + WebRTC) | $0.0196 | **42%** |
| Cartesia TTS | $0.0155 | **33%** |
| Deepgram STT | $0.0108 | **23%** |
| LLM (Groq) | $0.0007 | **2%** |

**98% of v2's cost is plumbing and voice. The intelligence is 2%.**

This is the core misallocation in the proposed design: it optimises hard for
LLM latency and model choice (Groq LPU, flash-lite, prompt engineering) while
the bill is set by the transport, the transcriber and the voice.

It also means the review's own headline concern — "model picks are stale" — is
a **2%-of-cost** problem. Hanacaraka-ing between Groq and Gemini Flash-Lite
changes almost nothing about the bill.

---

## v2 only wins on long sessions

Crossover is around **10-12 turns / ~2.5-3 minutes**:

| Turns | Wall | v1 | v2 | Cheaper |
|---|---|---|---|---|
| 1 | 14 s | $0.0033 | $0.0078 | v1 |
| 4 | 56 s | $0.0190 | $0.0315 | v1 |
| 8 | 112 s | $0.0530 | $0.0632 | v1 |
| 12 | 168 s | $0.1022 | $0.0952 | **v2** |
| 20 | 280 s | $0.2460 | $0.1600 | v2 |
| 40 | 560 s | $0.8699 | $0.3264 | v2 |
| 60 | 840 s | $1.8719 | $0.4992 | v2 |

v1 loses on long sessions because audio context accumulates at 4x the text
rate. v2's per-minute cost is flat, so it eventually wins.

**But your p90 is 253 s (4.2 min).** Only about 10% of sessions run long enough
for v2 to be cheaper, and those are weighted 2% in the blended figure. v2 is
optimised for traffic you barely have.

---

## At volume rates they roughly tie

| Scenario | Blended cost |
|---|---|
| v1 (measured) | $0.0075 / session |
| v2 at LiveKit Cloud list rates | $0.0147 / session |
| v2 with Cartesia at $10/M chars + self-hosted LiveKit | **$0.0061** / session |

So v2 is not structurally unaffordable — it becomes competitive, but only after
you have both volume TTS pricing **and** a self-hosted SFU. That means taking on
the operational burden of running LiveKit yourself, and it lands you at parity,
not advantage.

---

## The always-on trap

The review flagged 840 billable streamed minutes per counter per 14-hour day.
Priced out:

| Component | Monthly, per counter |
|---|---|
| Deepgram Nova-3 streaming | Rp 2,411,640 |
| LiveKit SFU + agent | Rp 6,237,000 |
| **Total, before any LLM or TTS** | **Rp 8,648,640** |

At 100 counters that is **Rp 865 million/month** — roughly 1,150x the Starter
plan price, for one counter's worth of silence.

**Session gating is therefore not an optimisation in v2. It is the difference
between viable and catastrophic.** The review recommends gating for UX and
privacy reasons; the cost argument is far stronger and is missing from it.

---

## What v2 genuinely gets right

Not everything about the proposal is wrong. Two things are real advantages:

1. **Prompt caching.** v1 pays the 1,267-token system instruction on *every
   turn* because Live models have no caching. v2's LLM stage caches it. This
   drops v2's LLM share to ~1%.
2. **Long-session behaviour.** v1's per-minute cost rises 4.7x from short to
   long sessions. v2's is flat. If the product ever moves toward long, complex,
   consultative conversations, v2's economics improve and v1's degrade.

Also fair: vendor substitutability, independent per-stage scaling, and an
easier human-takeover path.

---

## The measurement that matters

v1's cost is dominated by re-billing the system instruction every turn. That
invites the obvious fix: shrink the prompt. Measured breakdown of the seeded
merchant's 1,267 tokens:

| Variant | Tokens | Saving |
|---|---|---|
| full (as shipped) | 1,267 | — |
| products removed (→ `search_products` tool) | 1,046 | 17% |
| knowledge removed | 1,152 | 9% |
| both removed | 931 | 27% |
| defaults only, no custom rules | 1,316 | **-4%** |

**The menu is only 17%.** 74% of the prompt is fixed scaffolding — capability
descriptions, tool instructions, language lock, tone presets. And the default
templates are *more* verbose than the seeded custom rules.

So "shrink the prompt" is worth ~27% at best, and it requires moving menu and
knowledge into tools you already have (`search_products` exists). Useful, but it
does not close a 1.96x gap.

---

## Can the cheapest possible models save v2?

No — and the reason is the most useful finding in this whole comparison.

I costed three tiers:

| Tier | Rp/session | vs v1 |
|---|---|---|
| v1 (Gemini Live, measured) | 123 | 1.00x |
| **A. as designed** (LiveKit + Deepgram + Cartesia + Groq 120b) | 242 | **1.96x** |
| **B. cheapest models, same architecture** (promo Deepgram + Gemini Flash-Lite TTS + Groq 20b) | 167 | **1.35x** |
| **C. cheapest everything** (no SFU, batch STT, raw WebSocket) | **33** | **0.26x** |

Where the money goes on a typical order:

| Tier | stt | transport | tts | llm |
|---|---|---|---|---|
| A | 23% | **42%** | 33% | 2% |
| B | 20% | **62%** | 9% | 1% |
| C | 4% | 16% | **73%** | 6% |

**Swapping to the cheapest available models moves v2 from 1.96x to 1.35x.** The
transport share goes *up*, from 42% to 59%, because Cartesia and Deepgram were
the parts you could actually optimise. The SFU is not model-dependent and it is
not cheap.

### The decisive test

Take tier C's ultra-cheap models and put the v2 architecture back around them:

| Configuration | Rp/session | vs v1 |
|---|---|---|
| Tier C models + managed SFU + streaming STT | 167 | **1.35x** |
| Tier C as modelled (batch STT, raw WebSocket) | 33 | 0.26x |

**The cheapest models in the world still lose by 68% if you keep the SFU and
streaming STT.** The saving comes from the architecture, not the models.

### So what IS tier C?

Tier C is not v2. It is **v1's transport with a cascaded brain** — raw WebSockets
(the platform already uses these), buffered Whisper instead of streaming STT, and
cheap TTS. It is 3.7x cheaper than v1 because:

- **Batch STT bills speech, not connection.** Groq's Whisper large-v3-turbo is
  $0.04/hour = $0.00067/min, and you only pay for audio you actually submit.
  Deepgram streaming at $0.0058/min bills the entire wall clock.
  That is a **~50x swing on a session that is 80% silence.**
- **No SFU.** The transport line collapses from 42% of the bill to 16%.
- **Prompt caching** kills v1's 1,267-tokens-per-turn problem.

The costs: Whisper is buffered, so you lose streaming partials and pay
endpointing latency before transcription starts; raw WebSockets lose the SFU's
jitter and packet-loss handling; and TTS becomes 73% of the bill, so self-hosting
Kokoro-82M (Apache 2.0) is the next move to zero it out.

**Tier C has none of the properties the v2 document argues for** — no sub-500 ms
claim, no WebRTC, no streaming at every hop, no semantic turn detection. If you
want those, they are exactly what the 1.96x buys. If you don't want to pay for
them, you have rebuilt something close to what already ships.

### The one configuration that genuinely competes

| Scenario | Blended |
|---|---|
| v2 with Cartesia at $10/M chars + **self-hosted LiveKit** | $0.0061/session (Rp 101) |
| v1 (measured) | $0.0075/session (Rp 123) |

At full volume pricing **and** a self-hosted SFU, v2 comes in **19% below v1** —
the first configuration in this comparison where cascaded actually wins. The cost
of that win is running your own WebRTC infrastructure, four vendor relationships,
and a four-SPOF chain in place of one vendor. The 42% transport line is
load-bearing; you only remove it by becoming the transport yourself.

---

## Configuration: self-hosted infra + third-party models

You asked about self-hosting LiveKit and the orchestration layer while keeping
STT/LLM/TTS as vendors, with **DeepSeek V4.1 Flash** as the LLM.

**Costed as tier D** (self-hosted SFU + orchestration compute, Deepgram Nova-3
multilingual streaming, DeepSeek Flash, Gemini Flash-Lite TTS):

| Tier | Rp/session | vs v1 |
|---|---|---|
| v1 (measured) | 123 | 1.00x |
| A. as designed | 242 | 1.96x |
| B. cheapest models, same arch | 167 | 1.35x |
| C. cheapest everything | 33 | 0.26x |
| **D. self-hosted infra + third-party models** | **101** | **0.82x** |

**Self-hosting the infrastructure is what flips v2 below v1.** The SFU was 42%
of the bill in tier A; on your own metal it is 19%. That is the right call.

### But the LLM is now the wrong thing to optimise

Tier D cost split (typical order):

| Component | Share |
|---|---|
| **STT (Deepgram streaming)** | **55%** |
| TTS | 21% |
| Transport (self-hosted) | 19% |
| LLM | **4%** |

The LLM is 4% of the bill. And DeepSeek Flash is not even the cheapest option
at that 4%.

### DeepSeek Flash pricing has two traps

**Trap 1 — peak hours are Indonesian shop hours.** DeepSeek charges off-peak
rates at half price, and defines peak as `01:00-04:00` and `06:00-10:00 UTC`,
Monday-Friday. In WIB that is:

| DeepSeek peak (UTC) | WIB | Retail impact |
|---|---|---|
| 01:00-04:00 | **08:00-11:00** | morning trade, peak rate |
| 06:00-10:00 | **13:00-17:00** | afternoon trade, peak rate |

So the headline `$0.15 / $0.60` is the rate you will *not* be paying. Seven hours
of the trading day bill at `$0.30 / $1.20`.

**Trap 2 — at peak, DeepSeek is 2x Groq.** Comparing the LLM line on a typical
order:

| LLM | LLM cost / session |
|---|---|
| Groq gpt-oss-20b | $0.0004 |
| DeepSeek Flash, off-peak | ~$0.0004 (parity) |
| **DeepSeek Flash, peak** | **$0.0008 (2x)** |

DeepSeek's cache-read price is outstanding ($0.006/1M at peak vs Groq's
$0.0375/1M), which is why it looks cheap. But output is where the tokens go, and
peak output is `$1.20/1M` against Groq's flat `$0.30/1M`.

### The latency problem is the real one

This matters far more than the 4%. Artificial Analysis benchmarks DeepSeek V4.1
Flash (reasoning, max effort, 10k input):

| Provider | First chunk | Time to first **answer** token |
|---|---|---|
| LithosAI (ULTRA CHAT) | 0.51 s | **3.48 s** |
| LithosAI | 1.36 s | 4.67 s |
| DeepSeek (first-party) | 0.94 s | ~5.3 s |

Two things:

1. **Thinking mode is the default** in DeepSeek's API ("Supports both
   non-thinking and thinking (default) modes"). A voice agent that inherits the
   default gets a **3.5-5 s** time-to-first-answer-token. That is 7-12x a
   sub-500 ms budget, before STT or TTS.
2. Even with thinking disabled, first-chunk is 0.51-0.94 s against a
   `200-400 ms` LLM allocation in the v2 latency budget.

This is the same mistake as choosing the model for cost, one level up: the LLM
is 4% of the bill and roughly **40% of your latency budget**. Optimising the 4%
while spending the 40% is the wrong trade.

### Residency

`api.deepseek.com` is China-hosted. The review already flags Indonesia's PDP Law
(27/2022) and cross-border transfer. Routing customer speech transcripts there
is a compliance decision, not a cost one — but it is a question you will be
asked before a live store, not after.

### What to do instead

1. **Keep the self-hosted infra decision.** It is what makes v2 cheaper than v1.
2. **Attack STT, not the LLM.** STT is 55% of tier D, and it is 55% *because
   streaming bills wall clock*. Moving from Deepgram streaming ($0.0058/min of
   connection) to buffered Whisper ($0.00067/min of speech) cuts that line by
   roughly 50x. This is by far the largest lever in your chosen architecture.
3. **Pick the LLM on TTFT and Bahasa tool-calling accuracy first**, then take
   the cheapest survivor. If DeepSeek Flash wins that bake-off in non-thinking
   mode, take it — but note it is 2x Groq at peak, so there is no cost argument
   for it.
4. **Model the SLO before the architecture.** The review's own estimate is
   0.7-1.2 s for the LLM path. If that is unacceptable, no model choice fixes
   it; if it is acceptable, then the 4% LLM line is not where the effort goes.

---

## LiveKit Cloud (Build free tier) vs self-hosted

Costed with **LiveKit's own published per-minute rates**, not my estimates:

| Tier | Rp/session | vs v1 | transport share |
|---|---|---|---|
| v1 (measured) | 123 | 1.00x | — |
| **D. self-hosted LiveKit** | **101** | **0.82x** | 19% |
| E. LiveKit Cloud, cheapest model in every slot | 145 | **1.17x** | **68%** |
| F. LiveKit Cloud, v2's named models | 238 | **1.93x** | 42% |

Tier E uses AssemblyAI Universal-Streaming-Multilingual ($0.0025/min), GPT-5 nano
($0.0002/min), Fish Audio S2.1 Pro ($0.009/min) — the cheapest thing in every
slot on LiveKit's price list. **It is still more expensive than v1.**

### The number that decides it

**LiveKit Cloud charges $0.0100 per agent session minute.** That is not optional
and it is not model-dependent.

Your v1 cost, measured, is $0.0102 per billed minute. So the LiveKit Cloud
transport fee **alone** costs what your entire stack costs today — STT, LLM, TTS
and audio generation included.

Self-hosting is the only thing that removes it, and it is why tier D lands at
0.82x while tier E lands at 1.17x.

### Build plan ($0/mo) limits — it is a development tier

From the pricing page:

| Limit | Build | Consequence |
|---|---|---|
| **Concurrent agent sessions** | **5** | The same wall as your Gemini free tier (6) |
| Agent session minutes | 1,000/mo | Your **peak month was 1,905 min** — already exceeded |
| Agent deployments | 1 | No staging environment |
| Non-production deployments | 0 | Cannot test a change without touching prod |
| **Cold start prevention** | **—** | Agents spin down. Directly attacks TTFA, the point of v2 |
| Instant rollback | — | A bad deploy has no escape hatch |
| Zero data retention | — | Same compliance trap you are leaving Gemini for |
| Team collaboration | — | Single seat |
| Support | Community | No SLA |
| Inference credits | $2.50 (~50 min) | Consumed in a day of testing |
| Concurrent connections | 100 | Fine |
| WebRTC minutes | 5,000/mo | Fine |
| Uptime | 99.99% | Fine |

Two of these are disqualifying on their own:

1. **5 concurrent agent sessions** re-creates the exact blocker you are moving
   off Gemini's free tier to escape. A multi-tenant platform cannot launch on 5
   simultaneous conversations.
2. **No cold start prevention.** v2's entire justification is sub-500 ms. An
   agent that has spun down cannot deliver it. The free tier removes the single
   feature that protects the product's headline claim.

### Where Cloud does make sense

Ship ($50/mo) is the real entry point for a pilot: 20 concurrent sessions, 5,000
agent minutes, cold start prevention, 2 deployments, 1 non-production slot, 20
inference concurrency.

| Phase | Recommendation |
|---|---|
| Dev / demo | **Build ($0)** — it is free and the limits do not bite yet |
| Pilot, 1–10 stores | **Ship ($50/mo)** — 20 concurrent, cold start prevention |
| Scale, 10+ stores | **Self-host** — Cloud's $0.0105/min stops making sense |

Self-hosting break-even, using a $50/month node as the unit:

```
$50/mo  /  $0.0085/min saved  =  ~5,900 agent minutes/month
```

At 100 counters (~285,000 agent-minutes/month) Cloud costs roughly $2,990/mo
against ~$570/mo self-hosted plus ops.

### This is not lock-in, and that is the point

LiveKit is Apache 2.0 and the Agents framework targets both Cloud and
self-hosted identically. **Start on Cloud, migrate when the minutes justify it**
— the migration is a deployment change, not a rewrite. That inverts the earlier
advice: self-hosting is where you *end up*, not where you have to *start*.

Caveats to verify before committing:

- The pricing calculator adds **"Observability: $0.0100/min"** by default. If
  that is billed on top of the agent session minute, tier E roughly doubles and
  the Cloud case gets much worse. Confirm whether it can be disabled.
- My self-hosted transport estimate ($0.002/min) is an assumption. It sets the
  entire break-even; measure it against real node sizing before you rely on it.

---

## Recommendation

**Do not migrate to v2 *as designed* — but the self-hosted variant is a real
option.** Tier D (self-hosted SFU + orchestration, third-party models) lands at
**0.82x v1**, and the corrected tier A is **1.96x**. So the cost objection
applies to Cloud-only v2, not to a self-hosted v2. What remains against
self-hosting is operational and latency-related, not economic.

**v2 as designed** is simultaneously:

- **1.96x more expensive** on your real traffic mix, and
- **operationally worse** — four SPOFs in series, no degraded mode, stateful
  workers, and its own 380 ms claim is not achievable (the review documents this
  convincingly).

The review's architecture proposal and the review's risk list should be judged
separately. The risk list is excellent. The architecture is where the errors are.

### What to take from the review (architecture-independent)

These findings apply to v1 today and are worth acting on regardless of pipeline:

| Finding | Action |
|---|---|
| Nothing enforces price or authority | Keep price/discount rules in code; speak prices from templates fed by tool results, never model-generated digits |
| No model of *who* the customer is | Gate sessions on a POS event / button / proximity; wipe context on payment or timeout |
| No degraded mode, SPOFs | Voice must assist, never gate the POS; cached fallback prompts on failure |
| No observability or eval | Per-turn trace, golden Bahasa audio set, noisy-replay CI, per-store canary |
| Privacy / PDP Law 27/2022 | Consent, retention, redaction; keep payment on a separate rail |
| Stale model picks | Pinned versions + monthly deprecation check |

### What to do instead of migrating

1. **Link billing and move off the free tier.** 6 concurrent sessions and no DPA
   blocks launch no matter which architecture you pick.
2. **Fix the revenue leaks** in [COST-MODEL.md](COST-MODEL.md) §6 — worth more
   than any architecture change.
3. **Move the menu into `search_products`** — ~17% off every turn, on top of
   whatever the leaks are costing you.
4. **Revisit v2 on evidence, not on latency claims.** The trigger conditions are:
   median session length approaching 3–4 minutes, or a contractual requirement
   that audio stay in Indonesia, or a need for per-stage vendor substitution.
   None of those hold today.

### The open question that changes the answer

The review asks it too, and it is the right question: **is voice the cashier, or
an information kiosk?**

- If voice **takes orders and payment**, v1's tool-grounded cart + session
  model is closer to what you already have, and the cost advantage compounds.
- If voice is a **price-check and FAQ surface** with mostly short interactions,
  v2 is at its worst — 1.96x for traffic that never gets long enough to benefit.

Either way, the answer for now is the same.
