// Concurrency ramp: how many simultaneous Live sessions does this key/project allow?
// Usage: GEMINI_KEY=... node concurrency-probe.mjs [model] [maxN]

const KEY = process.env.GEMINI_KEY;
const MODEL = process.argv[2] ?? "gemini-3.8-live";
const MAX = Number(process.argv[3] ?? 6);
const URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${KEY}`;

const setup = (turn) => JSON.stringify({
  setup: {
    model: `models/${MODEL}`,
    generationConfig: { responseModalities: ["AUDIO"] },
    systemInstruction: { parts: [{ text: "You are a test bot. Reply with one word." }] },
  },
});

function openSession(id) {
  return new Promise((resolve) => {
    const t = Date.now();
    const ws = new WebSocket(URL);
    const state = { id, setupOk: false, error: null, openedAt: null, setupAt: null, closeCode: null };
    const done = () => resolve({ ws, state });
    ws.onopen = () => { state.openedAt = Date.now() - t; ws.send(setup(id)); };
    ws.onmessage = async (ev) => {
      const raw = typeof ev.data === "string" ? ev.data : Buffer.from(await ev.data.arrayBuffer()).toString("utf8");
      let msg; try { msg = JSON.parse(raw); } catch { return; }
      if (msg.setupComplete) { state.setupOk = true; state.setupAt = Date.now() - t; done(); }
      if (msg.error) { state.error = msg.error; done(); }
    };
    ws.onerror = (e) => { state.error ??= { message: e?.message ?? "ws error" }; done(); };
    ws.onclose = (e) => { state.closeCode = e.code; state.closeReason = e.reason; if (!state.setupOk) done(); };
    setTimeout(() => done(), 12000);
  });
}

const live = [];
for (let n = 1; n <= MAX; n++) {
  const s = await openSession(n);
  live.push(s);
  const ok = live.filter((x) => x.state.setupOk).length;
  const err = s.state.error;
  console.log(
    `session ${String(n).padStart(2)}  ${s.state.setupOk ? "ACCEPTED" : "REJECTED"}`,
    ` setup=${String(s.state.setupAt ?? "-").padStart(5)}ms`,
    ` concurrent_ok=${ok}`,
    err ? `  err=${err.status ?? ""} ${String(err.message).slice(0, 160)}` : "",
    s.state.closeCode ? `  close=${s.state.closeCode} ${String(s.state.closeReason ?? "").slice(0, 80)}` : "",
  );
  if (err) { console.log("\n>>> first rejection at n =", n); break; }
}

console.log("\nholding", live.filter((x) => x.state.setupOk).length, "sessions open for 8s...");
await new Promise((r) => setTimeout(r, 8000));
for (const s of live) { try { s.ws.close(); } catch {} }
console.log("done.");
setTimeout(() => process.exit(0), 300);
