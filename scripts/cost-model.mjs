#!/usr/bin/env node
/**
 * Lorescale Voice — Gemini cost model.
 *
 * Every mechanic in here was measured against the live API on 2026-09-30, not
 * taken from docs. Three findings drive the whole model:
 *
 *   1. `systemInstruction` is re-billed IN FULL on every single model turn.
 *      Measured: a 1,267-token merchant prompt raised turn-1 prompt tokens
 *      from 560 (tiny prompt) to 1,815.
 *
 *   2. The model's own audio output re-enters the conversation context and is
 *      re-billed as AUDIO INPUT on every later turn. Measured exactly:
 *      audio_in(n) = 222 + sum(audio_out(1..n-1)).
 *      Audio input is 4x the price of text, so cost grows superlinearly.
 *
 *   3. Thinking tokens are billed as output.
 *
 * Pricing is Google's published paid-tier rate for gemini-3.8-live:
 *   text in $0.75/1M · audio in $3.00/1M · text out $4.50/1M · audio out $12.00/1M
 * Audio is 25 tokens/second (Google's stated rate).
 *
 * Usage:  node scripts/cost-model.mjs [--json]
 */

const PRICE = { textIn: 0.75, audioIn: 3.0, textOut: 4.5, audioOut: 12.0 }; // USD per 1M tokens
const AUDIO_TOKENS_PER_SEC = 25;
const USD_IDR = 16_500;

/** System-instruction size measured from the seeded Sunrise Coffee merchant. */
export const SYSTEM_PROMPT_TOKENS = 1_267;

/**
 * Cost of one voice session, modelling context accumulation.
 *
 * IMPORTANT for margin: the platform bills the tenant by WALL CLOCK (ended_at -
 * started_at, min 15s), but Gemini only charges for tokens. Every second the
 * visitor is silent or the kiosk is waiting on VAD is billed to the tenant and
 * costs the platform nothing. `idleSec` captures that free margin.
 *
 * @param {object} s
 * @param {number} s.turns          model turns (generations) in the session
 * @param {number} s.userSec        seconds the visitor speaks per turn
 * @param {number} s.modelSec       seconds the assistant speaks per turn
 * @param {number} s.thoughtsPerTurn thinking tokens per turn
 * @param {number} [s.idleSec]      dead air / VAD waiting, billed but free to us
 * @param {number} [s.systemTokens] system instruction size
 */
export function sessionCost(s) {
	const {
		turns,
		userSec,
		modelSec,
		thoughtsPerTurn,
		idleSec = 0,
		systemTokens = SYSTEM_PROMPT_TOKENS,
	} = s;

	const tok = { textIn: 0, audioIn: 0, textOut: 0, audioOut: 0 };
	let spokenByUser = 0; // audio tokens already in context
	let spokenByModel = 0;

	for (let turn = 1; turn <= turns; turn++) {
		// Context re-billed this turn: the full system prompt (again), plus every
		// token of audio already exchanged. Text thinking from prior turns also
		// stays in context.
		tok.textIn += systemTokens + thoughtsPerTurn * (turn - 1);
		tok.audioIn += spokenByUser + spokenByModel;

		const outAudio = Math.round(modelSec * AUDIO_TOKENS_PER_SEC);
		tok.audioOut += outAudio;
		tok.textOut += thoughtsPerTurn;

		spokenByUser += Math.round(userSec * AUDIO_TOKENS_PER_SEC);
		spokenByModel += outAudio;
	}

	const usd =
		(tok.textIn / 1e6) * PRICE.textIn +
		(tok.audioIn / 1e6) * PRICE.audioIn +
		(tok.textOut / 1e6) * PRICE.textOut +
		(tok.audioOut / 1e6) * PRICE.audioOut;

	// +2s per turn of VAD/turn-taking latency is wall clock the visitor is billed
	// for via the platform's own minute ledger.
	const durationSec = turns * (userSec + modelSec + 2) + idleSec;

	return {
		...s,
		tok,
		usd,
		durationSec,
		// What the tenant is charged for (platform's own ledger, min 15s floor).
		billedSeconds: Math.max(15, Math.ceil(durationSec)),
		usdPerMin: usd / (durationSec / 60),
	};
}

/** Profiles derived from 2,043 real sessions in the production backup. */
export const PROFILES = {
	"abandoned (15s floor, no answer)": {
		turns: 1,
		userSec: 4,
		modelSec: 0,
		thoughtsPerTurn: 10,
	},
	"greeting only (~30s)": {
		turns: 1,
		userSec: 6,
		modelSec: 8,
		thoughtsPerTurn: 40,
		idleSec: 6,
	},
	"short order (~60s)": {
		turns: 3,
		userSec: 5,
		modelSec: 7,
		thoughtsPerTurn: 60,
		idleSec: 6,
	},
	"typical order (real mean: 112s, 3.8 turns)": {
		turns: 4,
		userSec: 5,
		modelSec: 7,
		thoughtsPerTurn: 60,
		idleSec: 56,
	},
	"big order w/ upsell (~4min)": {
		turns: 12,
		userSec: 5,
		modelSec: 7,
		thoughtsPerTurn: 90,
		idleSec: 60,
	},
	"heavy browse (~8min, p95+)": {
		turns: 24,
		userSec: 5,
		modelSec: 7,
		thoughtsPerTurn: 90,
		idleSec: 100,
	},
};

export const PLANS = [
	{ code: "trial", minutes: 30, priceIdr: 0 },
	{ code: "starter", minutes: 300, priceIdr: 749_000 },
	{ code: "growth", minutes: 1_500, priceIdr: 2_249_000 },
	{ code: "enterprise", minutes: 5_000, priceIdr: 5_000_000 },
];

export const ADDON_IDR = 199_000;

/**
 * LORESCALE LIVE — one SHARED Live session per room, plus a text call every
 * HOST_INTERVAL_MS (40s) while at least one viewer is connected.
 * From apps/server/src/services/live.ts:1094 (HOST_INTERVAL_MS = 40_000).
 */
export function liveRoomCost({ hours, viewers = 1 }) {
	const ticks = (hours * 3600) / 40; // host loop ticks
	// One text generation per tick (LIVE_TEXT_MODELS chain, 3.6 Flash rates).
	const hostTextUsd = ticks * ((SYSTEM_PROMPT_TOKENS * 1.2) / 1e6) * 0.75;
	// One narration turn per tick through the shared Live session.
	const liveUsd =
		ticks *
		((SYSTEM_PROMPT_TOKENS / 1e6) * PRICE.textIn +
			((6 * AUDIO_TOKENS_PER_SEC) / 1e6) * PRICE.audioOut);
	const usd = hostTextUsd + liveUsd;
	return { hours, viewers, ticks, usd, usdPerHour: usd / hours };
}

/**
 * AI Presenter — ONE GEMINI LIVE SESSION PER VIEWER (not per room), capped at
 * PRESENTER_MAX_VIEWERS_PER_SESSION = 20. Each viewer's session re-bills the
 * full system instruction on every slide cue.
 * From apps/server/src/services/presenter-live.ts + routes/presentation-websocket.ts.
 */
export function presenterCost({ deckMinutes, viewers, cuesPerMinute = 0.5 }) {
	const cues = Math.round(deckMinutes * cuesPerMinute);
	// per viewer, per cue: system prompt re-billed + ~8s of cue audio out
	const perViewerUsd =
		cues *
		((SYSTEM_PROMPT_TOKENS / 1e6) * PRICE.textIn +
			((8 * AUDIO_TOKENS_PER_SEC) / 1e6) * PRICE.audioOut);
	const usd = perViewerUsd * viewers;
	return { deckMinutes, viewers, cues, usd, usdPerViewer: perViewerUsd };
}

/**
 * Non-Gemini monthly infrastructure. EDIT THESE to your actual invoices —
 * they are placeholders because the deploy docs target "any host".
 */
export const INFRA = [
	{ item: "Postgres (Aiven free tier now; needs production plan)", usd: 0 },
	{ item: "Redis (Upstash)", usd: 0 },
	{ item: "Object storage + egress (Cloudflare R2)", usd: 0 },
	{ item: "API container host x2 replicas", usd: 0 },
	{ item: "Frontends (Vercel x4)", usd: 0 },
];

const round = (n, d = 4) => Number(n.toFixed(d));

if (import.meta.url === `file://${process.argv[1]}`) {
	const asJson = process.argv.includes("--json");

	const perSession = Object.entries(PROFILES).map(([label, p]) => ({
		label,
		...sessionCost(p),
	}));

	const typical = perSession.find((p) => p.label.startsWith("typical order"));
	const infraUsd = INFRA.reduce((s, i) => s + i.usd, 0);

	/** Cost per minute the TENANT is billed for — the number that sets margin. */
	const costPerBilledMin = (p) => p.usd / (p.billedSeconds / 60);

	const plans = PLANS.map((p) => {
		const geminiIdr = costPerBilledMin(typical) * USD_IDR * p.minutes;
		return {
			...p,
			geminiIdr,
			marginPct:
				p.priceIdr > 0 ? ((p.priceIdr - geminiIdr) / p.priceIdr) * 100 : null,
		};
	});

	if (asJson) {
		console.log(
			JSON.stringify(
				{
					perSession: perSession.map((p) => ({
						label: p.label,
						usd: round(p.usd),
						usdPerMin: round(p.usdPerMin),
						costPerBilledMin: round(costPerBilledMin(p)),
						durationSec: p.durationSec,
						billedSeconds: p.billedSeconds,
						tok: p.tok,
					})),
					plans: plans.map((p) => ({
						code: p.code,
						geminiIdr: Math.round(p.geminiIdr),
						marginPct: round(p.marginPct ?? 0, 1),
					})),
					infraUsd,
				},
				null,
				2,
			),
		);
	} else {
		console.log(
			"=== Gemini cost per voice session (paid tier, gemini-3.8-live) ===\n",
		);
		console.log(
			`${"profile".padEnd(42)}${"wall".padStart(7)}${"billed".padStart(8)}${"turns".padStart(7)}${"USD".padStart(10)}${"Rp/sess".padStart(10)}${"Rp/billed-min".padStart(15)}`,
		);
		for (const p of perSession) {
			console.log(
				`${p.label.padEnd(42)}${(`${p.durationSec}s`).padStart(7)}${(`${p.billedSeconds}s`).padStart(8)}${String(p.turns).padStart(7)}${(`$${p.usd.toFixed(4)}`).padStart(10)}${Math.round(
					p.usd * USD_IDR,
				)
					.toLocaleString("id-ID")
					.padStart(10)}${Math.round(costPerBilledMin(p) * USD_IDR)
					.toLocaleString("id-ID")
					.padStart(15)}`,
			);
		}

		console.log(
			`\nReal margin driver (typical order): Rp ${Math.round(costPerBilledMin(typical) * USD_IDR).toLocaleString("id-ID")} per BILLED minute.`,
		);
		console.log(
			`Platform's hardcoded assumption (routes/platform/subscriptions.ts:197): $0.023/min = Rp ${Math.round(0.023 * USD_IDR).toLocaleString("id-ID")}/min`,
		);
		console.log(
			`Worst case (heavy browse): Rp ${Math.round(costPerBilledMin(perSession.at(-1)) * USD_IDR).toLocaleString("id-ID")} per billed minute.`,
		);

		console.log(
			"\n=== Gross margin by plan (full allowance used, typical-order mix) ===\n",
		);
		console.log(
			`${"plan".padEnd(13)}${"min/mo".padStart(9)}${"Gemini cost".padStart(15)}${"Revenue".padStart(15)}${"Gross margin".padStart(14)}`,
		);
		for (const p of plans) {
			const margin =
				p.marginPct === null ? "n/a (free)" : `${p.marginPct.toFixed(1)}%`;
			console.log(
				`${p.code.padEnd(13)}${String(p.minutes).padStart(9)}${(`Rp ${Math.round(p.geminiIdr).toLocaleString("id-ID")}`).padStart(15)}${(`Rp ${p.priceIdr.toLocaleString("id-ID")}`).padStart(15)}${margin.padStart(14)}`,
			);
		}

		console.log(
			"\n=== Plan stress test: same plans, but tenants behave like heavy browsers ===\n",
		);
		const heavy = perSession.at(-1);
		console.log(
			`${"plan".padEnd(13)}${"Gemini cost".padStart(15)}${"Revenue".padStart(15)}${"Gross margin".padStart(14)}`,
		);
		for (const p of PLANS) {
			if (p.priceIdr === 0) continue;
			const cost = costPerBilledMin(heavy) * USD_IDR * p.minutes;
			const margin = ((p.priceIdr - cost) / p.priceIdr) * 100;
			const warn = margin < 0 ? "  <-- LOSS" : "";
			console.log(
				`${p.code.padEnd(13)}${(`Rp ${Math.round(cost).toLocaleString("id-ID")}`).padStart(15)}${(`Rp ${p.priceIdr.toLocaleString("id-ID")}`).padStart(15)}${(`${margin.toFixed(1)}%`).padStart(14)}${warn}`,
			);
		}

		console.log("\n=== Add-on surfaces (both priced at Rp 199.000/mo) ===\n");
		console.log(
			"LORESCALE LIVE — one shared Live session per room + a text call every 40s:",
		);
		for (const h of [1, 10, 30, 60]) {
			const r = liveRoomCost({ hours: h });
			const breakEvenH = ADDON_IDR / (r.usdPerHour * USD_IDR);
			console.log(
				`  ${String(h).padStart(3)} h/mo  ->  Rp ${Math.round(r.usd * USD_IDR)
					.toLocaleString("id-ID")
					.padStart(9)}   (break-even at ${breakEvenH.toFixed(0)} h/mo)`,
			);
		}

		console.log("\nAI Presenter — one Live session PER VIEWER (cap 20):");
		for (const v of [1, 5, 20]) {
			const r = presenterCost({ deckMinutes: 30, viewers: v });
			console.log(
				`  30-min deck, ${String(v).padStart(2)} viewers  ->  Rp ${Math.round(
					r.usd * USD_IDR,
				)
					.toLocaleString("id-ID")
					.padStart(10)}   (${r.cues} cues each)`,
			);
		}
		const heavyDeck = presenterCost({ deckMinutes: 30, viewers: 20 });
		console.log(
			`  note: 20 viewers costs ${(heavyDeck.usd / presenterCost({ deckMinutes: 30, viewers: 1 }).usd).toFixed(0)}x a solo viewer for the same deck.`,
		);

		console.log(
			`\nAdd-on price: Rp ${ADDON_IDR.toLocaleString("id-ID")}/mo each (7 available).`,
		);
		console.log(
			`Non-Gemini infra total: $${infraUsd}/mo (edit INFRA in this file with real invoices).`,
		);
	}
}
