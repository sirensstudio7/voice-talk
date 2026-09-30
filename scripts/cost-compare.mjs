#!/usr/bin/env node
/**
 * v1 (Gemini Live native audio) vs v2 (cascaded STT→LLM→TTS on LiveKit) cost comparison.
 *
 * v1 mechanics are MEASURED (see docs/COST-MODEL.md):
 *   - system instruction re-billed every turn, no caching
 *   - assistant audio re-enters context and is re-billed as audio input
 *   - silence is free (token-billed only)
 *
 * v2 mechanics are the inverse:
 *   - STT and the SFU bill per MINUTE CONNECTED, including silence
 *   - LLM supports prompt caching, so the system prompt costs ~10-50% not 100%
 *   - conversation history is TEXT, so there is no audio re-billing
 *
 * Vendor rates used (public list prices, Sept 2026 — verify before committing):
 *   Deepgram Nova-3 streaming   $0.0048/min promo, $0.0077/min list, $0.0058 multilingual
 *   Cartesia Sonic              ~1 credit/char, ~$10-50 per 1M chars by volume
 *   LiveKit Cloud               ~$0.005/participant-min + ~$0.01/agent-min
 *   Groq gpt-oss-120b           $0.15/1M in, $0.60/1M out, $0.075/1M cached
 *   Gemini 3.5 Flash-Lite       $0.30/1M in, $2.50/1M out
 *
 * Usage: node scripts/cost-compare.mjs [--json]
 */

const USD_IDR = 16_500;
const AUDIO_TOKENS_PER_SEC = 25;
const CHARS_PER_SEC_OF_SPEECH = 15; // ~900 chars per spoken minute
const SYS = 1_267; // measured system-instruction size, seeded merchant

// --- v1: Gemini Live, native audio (measured mechanics) ---
const V1_PRICE = { textIn: 0.75, audioIn: 3.0, textOut: 4.5, audioOut: 12.0 };

export function v1Cost({
	turns,
	userSec,
	modelSec,
	thoughtsPerTurn = 60,
	idleSec = 0,
}) {
	const t = { textIn: 0, audioIn: 0, textOut: 0, audioOut: 0 };
	let spokenUser = 0,
		spokenModel = 0;
	for (let i = 1; i <= turns; i++) {
		t.textIn += SYS + thoughtsPerTurn * (i - 1); // system prompt re-billed every turn
		t.audioIn += spokenUser + spokenModel; // accumulated audio re-billed
		const out = Math.round(modelSec * AUDIO_TOKENS_PER_SEC);
		t.audioOut += out;
		t.textOut += thoughtsPerTurn;
		spokenUser += Math.round(userSec * AUDIO_TOKENS_PER_SEC);
		spokenModel += out;
	}
	const usd =
		(t.textIn / 1e6) * V1_PRICE.textIn +
		(t.audioIn / 1e6) * V1_PRICE.audioIn +
		(t.textOut / 1e6) * V1_PRICE.textOut +
		(t.audioOut / 1e6) * V1_PRICE.audioOut;
	return { usd, wallSec: turns * (userSec + modelSec + 2) + idleSec, tok: t };
}

// --- v2: cascaded pipeline ---
export const V2_RATES = {
	sttPerMin: 0.0058, // Nova-3 multilingual streaming (Indonesian needs multilingual)
	ttsPerMChars: 37, // Cartesia Sonic mid-volume; $10 at scale, $50 at Pro tier
	livekitPerMin: 0.0105, // LiveKit published: $0.01 agent session + $0.0005 WebRTC
	computePerMin: 0, // orchestration hosting is inside the agent session minute
	llmIn: 0.15, // Groq gpt-oss-120b
	llmOut: 0.6,
	llmCachedIn: 0.075,
	cacheHitRate: 0.9, // prompt caching on the static system instruction
};

export function v2Cost({
	turns,
	userSec,
	modelSec,
	idleSec = 0,
	rates = V2_RATES,
	measureSttForFullSession = true,
}) {
	// Silence is billed by STT + SFU in a cascaded pipeline.
	const wallSec = turns * (userSec + modelSec + 2) + idleSec;
	const speechSec = turns * userSec;
	const sttSec = measureSttForFullSession ? wallSec : speechSec;

	const stt = (sttSec / 60) * rates.sttPerMin;
	const livekit = (wallSec / 60) * rates.livekitPerMin;
	const compute = (wallSec / 60) * rates.computePerMin;

	// LLM: history is text. System prompt is cached; per-turn history grows.
	let llm = 0;
	let historyTokens = 0;
	for (let i = 1; i <= turns; i++) {
		const cachedSys = SYS * rates.cacheHitRate * (rates.llmCachedIn / 1e6);
		const uncachedSys = SYS * (1 - rates.cacheHitRate) * (rates.llmIn / 1e6);
		const hist = (historyTokens / 1e6) * rates.llmIn;
		const outTokens = 90; // 1-2 spoken sentences
		const out = (outTokens / 1e6) * rates.llmOut;
		llm += cachedSys + uncachedSys + hist + out;
		historyTokens += Math.round(userSec * 3.3) + outTokens; // ~200 wpm → ~3.3 tok/sec
	}

	const ttsChars = turns * modelSec * CHARS_PER_SEC_OF_SPEECH;
	const tts = (ttsChars / 1e6) * rates.ttsPerMChars;

	const usd = stt + livekit + compute + llm + tts;
	return { usd, wallSec, parts: { stt, livekit, compute, llm, tts }, ttsChars };
}

// --- v2 cost tiers ---
//
// The question "what if we pick the cheapest models?" has three different
// answers depending on HOW FAR you go, because 48% of v2's cost is the
// transport, not the models.
//
//   tier A  the design as written (managed SFU, streaming STT, Cartesia)
//   tier B  cheapest models, same architecture (SFU + streaming STT kept)
//   tier C  cheapest everything: drop the SFU, batch STT (this is no longer
//           really v2 — the latency argument for v2 is what the SFU buys)
//
// Rates are public list prices, Sept 2026.
export const TIERS = {
	A: {
		label: "A. as designed",
		sttPerMin: 0.0058,
		sttBilledOn: "wall", // Deepgram Nova-3 multilingual streaming
		ttsPerMinOfSpeech: (37 / 1e6) * CHARS_PER_SEC_OF_SPEECH * 60, // Cartesia ~$37/1M chars
		transportPerMin: 0.0105, // LiveKit published: $0.01 agent session + $0.0005 WebRTC
		transportBilledOn: "wall",
		llmIn: 0.15,
		llmOut: 0.6,
		llmCachedIn: 0.075,
		computePerMin: 0,
	},
	B: {
		label: "B. cheapest models, same arch",
		sttPerMin: 0.0048, // Deepgram promo streaming
		sttBilledOn: "wall",
		ttsPerMinOfSpeech: 0.009, // Gemini 3.8 Flash-Lite TTS ($6/1M audio tok @ 25 tok/s)
		transportPerMin: 0.0105, // UNCHANGED — the SFU is the cost, not the model
		transportBilledOn: "wall",
		llmIn: 0.075,
		llmOut: 0.3,
		llmCachedIn: 0.0375, // Groq gpt-oss-20b
		computePerMin: 0,
	},
	C: {
		label: "C. cheapest everything (no SFU, batch STT)",
		sttPerMin: 0.00067, // Groq Whisper large-v3-turbo $0.04/hr
		sttBilledOn: "speech", // batch: you only pay for audio actually submitted
		ttsPerMinOfSpeech: 0.009, // Gemini Flash-Lite TTS (or ~0 self-hosted Kokoro)
		transportPerMin: 0.0005, // raw WebSocket on your own box
		transportBilledOn: "wall",
		llmIn: 0.075,
		llmOut: 0.3,
		llmCachedIn: 0.0375,
		computePerMin: 0,
	},
	D: {
		// "self-host the infra, third-party the models" — the configuration asked about.
		// LiveKit + orchestration on your own metal; STT/LLM/TTS from vendors.
		label: "D. self-hosted infra + DeepSeek Flash",
		sttPerMin: 0.0058, // Deepgram Nova-3 multilingual streaming, wall clock
		sttBilledOn: "wall",
		ttsPerMinOfSpeech: 0.009, // Gemini 3.8 Flash-Lite TTS
		transportPerMin: 0.002, // self-hosted LiveKit + orchestration compute (est., validate)
		transportBilledOn: "wall",
		// DeepSeek V4.1 Flash at PEAK rates: peak is 01:00-04:00 + 06:00-10:00 UTC
		// = 08:00-11:00 and 13:00-17:00 WIB — i.e. shop hours.
		llmIn: 0.3,
		llmOut: 1.2,
		llmCachedIn: 0.006,
		computePerMin: 0,
	},
	E: {
		// LiveKit Cloud, using LiveKit's OWN published per-minute rates, cheapest
		// model in every slot. Agent session fee is the floor and is unavoidable.
		label: "E. LiveKit Cloud, cheapest models",
		sttPerMin: 0.0025, // AssemblyAI Universal-Streaming-Multilingual
		sttBilledOn: "wall",
		ttsPerMinOfSpeech: 0.009, // Fish Audio S2.1 Pro / Inworld Flash
		transportPerMin: 0.0105, // $0.01 agent session + $0.0005 WebRTC
		transportBilledOn: "wall",
		llmPerMin: 0.0002, // OpenAI GPT-5 nano, LiveKit Inference rate
		computePerMin: 0,
	},
	F: {
		// Same as E but with the models the design actually names.
		label: "F. LiveKit Cloud, v2's named models",
		sttPerMin: 0.0058, // Deepgram Nova-3 Multilingual
		sttBilledOn: "wall",
		ttsPerMinOfSpeech: 0.03, // Cartesia Sonic 3
		transportPerMin: 0.0105, // $0.01 agent session + $0.0005 WebRTC
		transportBilledOn: "wall",
		llmPerMin: 0.0011, // DeepSeek-V4.1 Flash, LiveKit Inference rate
		computePerMin: 0,
	},
};

export function tierCost(tier, { turns, userSec, modelSec, idleSec = 0 }) {
	const wallSec = turns * (userSec + modelSec + 2) + idleSec;
	const speechSec = turns * userSec;
	const modelSpeechSec = turns * modelSec;

	const stt =
		((tier.sttBilledOn === "wall" ? wallSec : speechSec) / 60) * tier.sttPerMin;
	const transport =
		((tier.transportBilledOn === "wall" ? wallSec : speechSec) / 60) *
		tier.transportPerMin;
	const compute = (wallSec / 60) * tier.computePerMin;
	const tts = (modelSpeechSec / 60) * tier.ttsPerMinOfSpeech;

	let llm = 0;
	if (tier.llmPerMin != null) {
		// LiveKit Inference quotes LLM as a flat per-agent-minute rate.
		llm = (wallSec / 60) * tier.llmPerMin;
	} else {
		let historyTokens = 0;
		for (let i = 1; i <= turns; i++) {
			const cachedSys = SYS * 0.9 * (tier.llmCachedIn / 1e6);
			const uncachedSys = SYS * 0.1 * (tier.llmIn / 1e6);
			const hist = (historyTokens / 1e6) * tier.llmIn;
			const outTokens = 90;
			llm += cachedSys + uncachedSys + hist + (outTokens / 1e6) * tier.llmOut;
			historyTokens += Math.round(userSec * 3.3) + outTokens;
		}
	}

	return {
		usd: stt + transport + compute + tts + llm,
		wallSec,
		parts: { stt, transport, compute, tts, llm },
	};
}

export const REAL_SESSIONS = [
	{
		label: "abandoned (median 10.8s)",
		turns: 1,
		userSec: 4,
		modelSec: 0,
		idleSec: 4,
		weight: 0.54,
	},
	{
		label: "greeting only (~22s)",
		turns: 1,
		userSec: 6,
		modelSec: 8,
		idleSec: 6,
		weight: 0.16,
	},
	{
		label: "short order (~48s)",
		turns: 3,
		userSec: 5,
		modelSec: 7,
		idleSec: 6,
		weight: 0.18,
	},
	{
		label: "typical order (~112s)",
		turns: 4,
		userSec: 5,
		modelSec: 7,
		idleSec: 56,
		weight: 0.1,
	},
	{
		label: "long order (~228s)",
		turns: 12,
		userSec: 5,
		modelSec: 7,
		idleSec: 60,
		weight: 0.02,
	},
];

const rp = (n) => Math.round(n * USD_IDR).toLocaleString("id-ID");
const fmt = (n, d = 4) => `$${n.toFixed(d)}`;

if (import.meta.url === `file://${process.argv[1]}`) {
	const asJson = process.argv.includes("--json");

	const rows = REAL_SESSIONS.map((s) => {
		const a = v1Cost(s);
		const b = v2Cost(s);
		return { ...s, v1: a, v2: b };
	});

	const mixV1 = rows.reduce((s, r) => s + r.v1.usd * r.weight, 0);
	const mixV2 = rows.reduce((s, r) => s + r.v2.usd * r.weight, 0);

	if (asJson) {
		console.log(
			JSON.stringify(
				{
					rows: rows.map((r) => ({
						label: r.label,
						weight: r.weight,
						v1: r.v1.usd,
						v2: r.v2.usd,
						v2parts: r.v2.parts,
					})),
					mixV1,
					mixV2,
				},
				null,
				2,
			),
		);
	} else {
		console.log(
			"=== Per-session cost: v1 (Gemini native audio) vs v2 (cascaded) ===\n",
		);
		console.log(
			`${"session".padEnd(28)}${"mix".padStart(6)}${"wall".padStart(7)}${"v1 USD".padStart(10)}${"v2 USD".padStart(10)}${"v1 Rp".padStart(10)}${"v2 Rp".padStart(10)}${"delta".padStart(9)}`,
		);
		for (const r of rows) {
			const d = ((r.v2.usd / r.v1.usd - 1) * 100).toFixed(0);
			console.log(
				`${r.label.padEnd(28)}${(r.weight * 100).toFixed(0).padStart(5)}%${(`${r.v1.wallSec}s`).padStart(7)}${fmt(r.v1.usd).padStart(10)}${fmt(r.v2.usd).padStart(10)}${rp(r.v1.usd).padStart(10)}${rp(r.v2.usd).padStart(10)}${(`${d}%`).padStart(9)}`,
			);
		}

		console.log("\n=== Blended cost on the REAL traffic mix ===\n");
		console.log(
			`  v1 (Gemini Live)     ${fmt(mixV1)}/session  =  Rp ${rp(mixV1)}`,
		);
		console.log(
			`  v2 (cascaded)        ${fmt(mixV2)}/session  =  Rp ${rp(mixV2)}`,
		);
		console.log(
			`  v2 is ${(mixV2 / mixV1).toFixed(2)}x the cost of v1 on this mix.`,
		);

		console.log("\n=== Where the v2 money goes (typical order) ===\n");
		const t = rows.find((r) => r.label.includes("typical"));
		for (const [k, v] of Object.entries(t.v2.parts)) {
			const pct = ((v / t.v2.usd) * 100).toFixed(0);
			console.log(
				`  ${k.padEnd(10)} ${fmt(v)}  ${String(pct).padStart(3)}%  ${"█".repeat(Math.round(Number(pct) / 2))}`,
			);
		}

		console.log(
			"\n=== v2 is more expensive than v1 ONLY for long sessions ===\n",
		);
		console.log(
			`${"turns".padStart(6)}${"wall".padStart(8)}${"v1 USD".padStart(10)}${"v2 USD".padStart(10)}${"cheaper".padStart(10)}`,
		);
		for (const turns of [1, 2, 4, 8, 12, 20, 30, 40, 60]) {
			const s = { turns, userSec: 5, modelSec: 7 };
			const a = v1Cost(s);
			const b = v2Cost(s);
			console.log(
				`${String(turns).padStart(6)}${(`${a.wallSec}s`).padStart(8)}${fmt(a.usd).padStart(10)}${fmt(b.usd).padStart(10)}${(a.usd < b.usd ? "v1" : "v2").padStart(10)}`,
			);
		}

		console.log(
			"\n=== Sensitivity: v2 at volume rates (Cartesia $10/M chars, LiveKit self-hosted) ===\n",
		);
		const scaled = { ...V2_RATES, ttsPerMChars: 10, livekitPerMin: 0.002 };
		const rows2 = REAL_SESSIONS.map((s) => ({
			...s,
			usd: v2Cost({ ...s, rates: scaled }).usd,
		}));
		const mixV2b = rows2.reduce((s, r) => s + r.usd * r.weight, 0);
		console.log(
			`  v2 blended (list rates)      ${fmt(mixV2)}/session  = Rp ${rp(mixV2)}`,
		);
		console.log(
			`  v2 blended (volume + self-host) ${fmt(mixV2b)}/session  = Rp ${rp(mixV2b)}`,
		);
		console.log(
			`  v1 blended                    ${fmt(mixV1)}/session  = Rp ${rp(mixV1)}`,
		);

		console.log("\n=== CAN CHEAP MODELS SAVE v2? Three tiers vs v1 ===\n");
		console.log(
			`${"tier".padEnd(38)}${"Rp/session".padStart(12)}${"vs v1".padStart(9)}   (stt / transport / tts / llm per typical order)`,
		);
		console.log(
			`${"v1 (Gemini Live, measured)".padEnd(38)}${rp(mixV1).padStart(12)}${"1.00x".padStart(9)}   baseline`,
		);
		for (const key of ["A", "B", "C", "D", "E", "F"]) {
			const tier = TIERS[key];
			const blend = REAL_SESSIONS.reduce(
				(s, r) => s + tierCost(tier, r).usd * r.weight,
				0,
			);
			const p = tierCost(
				tier,
				REAL_SESSIONS.find((r) => r.label.includes("typical")),
			).parts;
			console.log(
				`${tier.label.padEnd(38)}${rp(blend).padStart(12)}${(blend / mixV1).toFixed(2).padStart(8)}x   ${fmt(p.stt)} / ${fmt(p.transport)} / ${fmt(p.tts)} / ${fmt(p.llm)}`,
			);
		}

		console.log("\nWhere each tier's money goes (typical order):\n");
		for (const key of ["A", "B", "C", "D", "E", "F"]) {
			const tier = TIERS[key];
			const p = tierCost(
				tier,
				REAL_SESSIONS.find((r) => r.label.includes("typical")),
			).parts;
			const tot = Object.values(p).reduce((s, v) => s + v, 0);
			console.log(
				`  ${tier.label.padEnd(38)} ${Object.entries(p)
					.map(([k, v]) => `${k} ${((v / tot) * 100).toFixed(0)}%`)
					.join("  ")}`,
			);
		}

		console.log(
			"\nTier C only wins because it drops the two things that MAKE it v2:",
		);
		const cWithSfu = {
			...TIERS.C,
			transportPerMin: 0.0105,
			transportBilledOn: "wall",
			sttBilledOn: "wall",
			sttPerMin: 0.0048,
		};
		const cSfuBlend = REAL_SESSIONS.reduce(
			(s, r) => s + tierCost(cWithSfu, r).usd * r.weight,
			0,
		);
		console.log(
			`  tier C models + managed SFU + streaming STT : ${rp(cSfuBlend).padStart(10)}/session = ${(cSfuBlend / mixV1).toFixed(2)}x v1`,
		);
		console.log(
			`  tier C as modelled (batch STT, raw WS)      : ${rp(REAL_SESSIONS.reduce((s, r) => s + tierCost(TIERS.C, r).usd * r.weight, 0)).padStart(10)}/session`,
		);

		console.log(
			"\n=== The always-on trap (review flagged 840 streamed min/day/counter) ===\n",
		);
		const alwaysOnMin = 14 * 60;
		for (const [name, rate] of [
			["Deepgram Nova-3 streaming", 0.0058],
			["LiveKit SFU + agent", 0.015],
		]) {
			const monthly = rate * alwaysOnMin * 30;
			console.log(
				`  ${name.padEnd(28)} $${monthly.toFixed(2)}/mo/counter = Rp ${rp(monthly)}`,
			);
		}
		const total = (0.0058 + 0.015) * alwaysOnMin * 30;
		console.log(
			`  ${"TOTAL if never gated".padEnd(28)} $${total.toFixed(2)}/mo/counter = Rp ${rp(total)}`,
		);
		console.log(
			`  at 100 counters: Rp ${rp(total * 100)}/mo, before a single token of LLM or TTS.`,
		);
	}
}
