const KEY = process.env.GEMINI_KEY;
const URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${KEY}`;
const open = () => new Promise((res) => {
  const ws = new WebSocket(URL); const st = { ok: false, reason: null }; let done = false;
  const fin = () => { if (!done) { done = true; res({ ws, st }); } };
  ws.onopen = () => ws.send(JSON.stringify({ setup: { model: "models/gemini-3.8-live",
    generationConfig: { responseModalities: ["AUDIO"] }, systemInstruction: { parts: [{ text: "t" }] } } }));
  ws.onmessage = async (e) => { const r = typeof e.data === "string" ? e.data : Buffer.from(await e.data.arrayBuffer()).toString("utf8");
    try { const m = JSON.parse(r); if (m.setupComplete) { st.ok = true; fin(); } } catch {} };
  ws.onclose = (e) => { st.reason = e.reason; fin(); };
  ws.onerror = () => fin(); setTimeout(fin, 8000);
});

console.log("A) saturate: 6 sessions, then close all immediately");
const held = [];
for (let i = 0; i < 6; i++) held.push(await open());
console.log("   held:", held.filter(h => h.st.ok).length);
for (const h of held) { try { h.ws.close(); } catch {} }
const closedAt = Date.now();

console.log("\nB) probe every 2s until a slot frees (measures release lag):");
let freedAfter = null;
for (let i = 1; i <= 8; i++) {
  await new Promise(r => setTimeout(r, 2000));
  const t = await open();
  const elapsed = ((Date.now() - closedAt) / 1000).toFixed(1);
  console.log(`   t+${elapsed}s  -> ${t.st.ok ? "ACCEPTED" : "rejected"}`);
  if (t.st.ok) { freedAfter = elapsed; try { t.ws.close(); } catch {} break; }
}
console.log(`\n   >>> slot released after approx ${freedAfter}s`);
setTimeout(() => process.exit(0), 300);
