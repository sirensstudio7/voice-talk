const KEY = process.env.GEMINI_KEY;
const URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${KEY}`;
const open = (id) => new Promise((res) => {
  const ws = new WebSocket(URL); const st = { id, ok: false, reason: null }; let done = false;
  const fin = () => { if (!done) { done = true; res({ ws, st }); } };
  ws.onopen = () => ws.send(JSON.stringify({ setup: { model: "models/gemini-3.8-live",
    generationConfig: { responseModalities: ["AUDIO"] }, systemInstruction: { parts: [{ text: "t" }] } } }));
  ws.onmessage = async (e) => { const r = typeof e.data === "string" ? e.data : Buffer.from(await e.data.arrayBuffer()).toString("utf8");
    try { const m = JSON.parse(r); if (m.setupComplete) { st.ok = true; fin(); } } catch {} };
  ws.onclose = (e) => { st.reason = e.reason; fin(); };
  ws.onerror = () => fin(); setTimeout(fin, 8000);
});
console.log("opening 6 sessions (saturating the window)...");
const all = [];
for (let i = 1; i <= 6; i++) { const s = await open(i); all.push(s); process.stdout.write(`  ${i}:${s.st.ok ? "ok" : "REJ"} `); }
console.log("\n\nclosing ALL 6 sessions...");
for (const s of all) { try { s.ws.close(); } catch {} }
await new Promise(r => setTimeout(r, 5000));
console.log("waited 5s, now attempting ONE fresh session...");
const t = await open(99);
console.log(t.st.ok
  ? "  ACCEPTED -> it IS a concurrency cap (slots do free up)"
  : "  REJECTED -> it is a per-minute CREATION quota, not concurrency");
if (!t.st.ok) console.log("  reason:", String(t.st.reason).slice(0, 140));
try { t.ws.close(); } catch {}
setTimeout(() => process.exit(0), 300);
