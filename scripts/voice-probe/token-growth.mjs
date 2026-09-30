// How does prompt token count grow per turn in a Live session?
// Opens a session with a real-sized system instruction and records usageMetadata per turn.
import { readFileSync } from "fs";

const KEY = process.env.GEMINI_KEY;
const URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${KEY}`;
const REAL_PROMPT = readFileSync(new URL("./system-instruction.txt", import.meta.url), "utf8");

const TINY = "You are a shop assistant. Reply in one short sentence.";

async function runSession(label, systemInstruction, turns) {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL);
    const q = []; let waiter = null;
    const push = (m) => { if (waiter) { const w = waiter; waiter = null; w(m); } else q.push(m); };
    const next = () => q.length ? Promise.resolve(q.shift()) : new Promise((w) => (waiter = w));
    const usage = [];
    let ready = false;

    ws.onopen = () => ws.send(JSON.stringify({
      setup: {
        model: "models/gemini-3.8-live",
        generationConfig: { responseModalities: ["AUDIO"] },
        systemInstruction: { parts: [{ text: systemInstruction }] },
        outputAudioTranscription: {},
      },
    }));

    ws.onmessage = async (e) => {
      const r = typeof e.data === "string" ? e.data : Buffer.from(await e.data.arrayBuffer()).toString("utf8");
      try {
        const m = JSON.parse(r);
        if (m.setupComplete) { ready = true; return; }
        if (m.usageMetadata) usage.push(m.usageMetadata);
        push(m);
      } catch {}
    };

    (async () => {
      while (!ready) { const m = await next(); if (m?.setupComplete) break; await new Promise(r => setTimeout(r, 50)); }
      for (const t of turns) {
        ws.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text: t }] }], turnComplete: true } }));
        const t0 = Date.now(); let audioMs = 0;
        while (Date.now() - t0 < 25000) {
          const m = await Promise.race([next(), new Promise(r => setTimeout(() => r({ TIMEOUT: true }), 8000))]);
          if (m?.TIMEOUT) break;
          const sc = m?.serverContent;
          if (sc?.turnComplete) break;
        }
      }
      ws.close();
      resolve(usage);
    })();

    setTimeout(() => { try { ws.close(); } catch {} resolve(usage); }, 120000);
  });
}

const turns = ["Halo", "Apakah ada kopi susu?", "Berapa harganya?", "Tolong tambahkan satu", "Terima kasih"];

for (const [label, prompt] of [["TINY prompt", TINY], ["REAL merchant prompt (~1267 tok)", REAL_PROMPT]]) {
  console.log(`\n=== ${label} ===`);
  const usage = await runSession(label, prompt, turns);
  console.log("turn | prompt | audio_out | thoughts | total");
  usage.forEach((u, i) => {
    const audio = (u.responseTokensDetails ?? []).filter(d => d.modality === "AUDIO").reduce((s, d) => s + d.tokenCount, 0);
    const audioIn = (u.promptTokensDetails ?? []).filter(d => d.modality === "AUDIO").reduce((s, d) => s + d.tokenCount, 0);
    console.log(`  ${String(i + 1).padStart(2)} | ${String(u.promptTokenCount).padStart(6)} | ${String(audio).padStart(9)} | ${String(u.thoughtsTokenCount ?? 0).padStart(8)} | ${String(u.totalTokenCount).padStart(6)}   (audio_in=${audioIn})`);
  });
  const last = usage[usage.length - 1];
  if (last) console.log(`  final prompt tokens: ${last.promptTokenCount}`);
  await new Promise(r => setTimeout(r, 3000));
}
setTimeout(() => process.exit(0), 300);
