const KEY = process.env.GEMINI_KEY;
const URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${KEY}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function session(setup, onError) {
  return new Promise((res) => {
    const ws = new WebSocket(URL);
    const q = []; let waiter = null;
    const push = (m) => { if (waiter) { const w = waiter; waiter = null; w(m); } else q.push(m); };
    const next = () => q.length ? Promise.resolve(q.shift()) : new Promise(w => waiter = w);
    ws.onopen = () => ws.send(JSON.stringify(setup));
    ws.onmessage = async (e) => {
      const r = typeof e.data === "string" ? e.data : Buffer.from(await e.data.arrayBuffer()).toString("utf8");
      try { push(JSON.parse(r)); } catch {}
    };
    ws.onclose = (e) => { onError?.({ close: e.code, reason: e.reason }); res({ ws, next, ok: false }); };
    ws.onerror = (e) => onError?.({ err: String(e?.message ?? e) });
    setTimeout(async () => {
      const first = await next();
      if (first?.setupComplete) res({ ws, next, ok: true });
      else { onError?.(first); res({ ws, next, ok: false }); }
    }, 100);
  });
}

async function turn(s, text) {
  const t = Date.now(); let firstAudio = null, transcript = "";
  s.ws.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: true } }));
  while (true) {
    const m = await s.next();
    if (m?.error) return { error: m.error.message };
    const sc = m?.serverContent; if (!sc) continue;
    for (const p of sc.modelTurn?.parts ?? []) if (p.inlineData?.data && !firstAudio) firstAudio = Date.now() - t;
    if (sc.outputTranscription?.text) transcript += sc.outputTranscription.text;
    if (sc.turnComplete) return { ttfa: firstAudio, total: Date.now() - t, transcript: transcript.trim() };
  }
}

console.log("=== warm multi-turn latency: gemini-3.8-live ===");
const a = await session({ setup: { model: "models/gemini-3.8-live", generationConfig: { responseModalities: ["AUDIO"] },
  systemInstruction: { parts: [{ text: "You are a shop assistant. One short sentence, Indonesian." }] },
  outputAudioTranscription: {} } }, (e) => console.log("setup rejected:", JSON.stringify(e).slice(0,300)));
if (a.ok) {
  for (const t of ["Halo", "Apakah ada kopi susu?", "Berapa harganya?"]) {
    const r = await turn(a, t);
    console.log(`  "${t}"  ttfa=${r.ttfa}ms  total=${r.total}ms  -> ${r.transcript?.slice(0,70)}`);
  }
  a.ws.close();
}

await sleep(3000);

console.log("\n=== does thinkingLevel break gemini-3.8-live? (docs say omit it) ===");
const b = await session({ setup: { model: "models/gemini-3.8-live", generationConfig: { responseModalities: ["AUDIO"] },
  thinkingConfig: { thinkingLevel: "minimal" } } }, () => {});
console.log("  result:", b.ok ? "ACCEPTED (docs claim it should be omitted)" : "REJECTED as documented");
try { b.ws.close(); } catch {}
setTimeout(() => process.exit(0), 300);
