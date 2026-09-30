// Distinguish "concurrent session cap" vs "session-creation-per-minute cap".
// Usage: GEMINI_KEY=... node slot-vs-rate.mjs

const KEY = process.env.GEMINI_KEY;
const MODEL = process.argv[2] ?? "gemini-3.8-live";
const URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${KEY}`;

function openSession(id, collectReason = null) {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL);
    const state = { id, setupOk: false, reason: null };
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve({ ws, state }); } };
    ws.onopen = () => ws.send(JSON.stringify({
      setup: { model: `models/${MODEL}`, generationConfig: { responseModalities: ["AUDIO"] },
        systemInstruction: { parts: [{ text: "test bot" }] } },
    }));
    ws.onmessage = async (ev) => {
      const raw = typeof ev.data === "string" ? ev.data : Buffer.from(await ev.data.arrayBuffer()).toString("utf8");
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.setupComplete) { state.setupOk = true; done(); }
    };
    ws.onclose = (e) => { state.reason = collectReason; state.closeReason = e.reason; state.closeCode = e.code; if (collectReason === null) state.reason = e.reason; done(); };
    ws.onerror = () => done();
    setTimeout(() => done(), 10000);
  });
}

console.log("STEP 1: saturate to the cap (6 sessions)\n");
const held = [];
for (let i = 1; i <= 6; i++) {
  const s = await openSession(i, "capture");
  held.push(s);
  console.log(`  open ${i}: ${s.state.setupOk ? "ACCEPTED" : "REJECTED"}`);
}

// capture the exact rejection text
const probe = await openSession(99, "capture");
const fullReason = held.concat([probe]).map(s => s.state.closeReason).find(r => r);
console.log("\n--- full rejection reason ---");
console.log(fullReason ?? "(none captured)");

console.log("\nSTEP 2: close ONE session, immediately try to open a new one");
console.log("  (if it succeeds -> CONCURRENCY limit; if it fails -> CREATION-RATE limit)\n");
const closed = held.shift();
try { closed.ws.close(); } catch {}
await new Promise((r) => setTimeout(r, 1500));

const re = await openSession(7, "capture");
console.log(`  reopen after freeing a slot: ${re.state.setupOk ? "ACCEPTED  -> concurrency cap" : "REJECTED  -> creation-rate cap"}`);
if (!re.state.setupOk && re.state.closeReason) console.log(`  reason: ${re.state.closeReason}`);

for (const s of held.concat([re, probe])) { try { s.ws.close(); } catch {} }
console.log("\nSTEP 3: wait 65s and see if the window resets...");
await new Promise((r) => setTimeout(r, 65000));
const after = await openSession(8, "capture");
console.log(`  after 65s: ${after.state.setupOk ? "ACCEPTED -> window reset (per-minute quota)" : "STILL REJECTED -> daily cap or longer window"}`);
try { after.ws.close(); } catch {}
setTimeout(() => process.exit(0), 500);
