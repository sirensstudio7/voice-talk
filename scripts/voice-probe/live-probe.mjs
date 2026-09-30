// Live API probe: connect, speak once, measure latency, inspect raw frames.
// Usage: GEMINI_KEY=... node live-probe.mjs [model]

const KEY = process.env.GEMINI_KEY;
if (!KEY) throw new Error("GEMINI_KEY missing");

const MODEL = process.argv[2] ?? "gemini-3.8-live";
const URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${KEY}`;

const t0 = Date.now();
const marks = {};
const mark = (name) => { marks[name] ??= Date.now() - t0; };

const setup = {
  setup: {
    model: `models/${MODEL}`,
    generationConfig: { responseModalities: ["AUDIO"] },
    systemInstruction: {
      parts: [{ text: "You are Alex, a friendly shop assistant. Reply in Indonesian, one short sentence." }],
    },
    outputAudioTranscription: {},
    inputAudioTranscription: {},
  },
};

const ws = new WebSocket(URL);
let audioBytes = 0;
let audioParts = 0;
let setupOk = false;
let closed = null;

ws.onopen = () => { mark("ws_open"); ws.send(JSON.stringify(setup)); };

ws.onmessage = async (ev) => {
  mark("first_frame");
  const raw = typeof ev.data === "string" ? ev.data : Buffer.from(await ev.data.arrayBuffer()).toString("utf8");
  let msg;
  try { msg = JSON.parse(raw); } catch { console.log("NON-JSON FRAME:", raw.slice(0, 400)); return; }

  if (msg.setupComplete) { setupOk = true; mark("setup_complete"); ws.send(JSON.stringify({
    clientContent: { turns: [{ role: "user", parts: [{ text: "Halo, ada yang bisa bantu?" }] }], turnComplete: true },
  })); return; }

  const sc = msg.serverContent;
  if (sc) {
    if (sc.interrupted) console.log("  [interrupted]");
    if (sc.inputTranscription?.text) console.log("  user said:", JSON.stringify(sc.inputTranscription.text));
    if (sc.outputTranscription?.text) { mark("first_transcript"); console.log("  model transcript:", JSON.stringify(sc.outputTranscription.text)); }
    for (const p of sc.modelTurn?.parts ?? []) {
      if (p.inlineData?.data) { audioParts++; audioBytes += Buffer.from(p.inlineData.data, "base64").length; mark("first_audio"); }
      if (p.text) console.log("  model text:", JSON.stringify(p.text).slice(0, 200));
    }
    if (sc.turnComplete) { mark("turn_complete"); finish(); }
  }
  if (msg.usageMetadata) console.log("  usage:", JSON.stringify(msg.usageMetadata));
  if (msg.goAway) console.log("  GOAWAY:", JSON.stringify(msg.goAway));
};

ws.onerror = (e) => { console.log("WS ERROR:", e?.message ?? e?.error?.message ?? String(e)); };
ws.onclose = (e) => { closed = { code: e.code, reason: e.reason }; mark("closed"); if (!marks.turn_complete) finish(); };

function finish() {
  ws.close();
  const seconds = (n) => n != null ? (n / 1000).toFixed(2) + "s" : "-";
  console.log("\n=== RESULT:", MODEL, "===");
  console.log("setup accepted  :", setupOk);
  console.log("audio parts     :", audioParts, `(${audioBytes} bytes ≈ ${(audioBytes / 48000).toFixed(2)}s @24kHz mono)`);
  console.log("ws open         :", seconds(marks.ws_open));
  console.log("setup complete  :", seconds(marks.setup_complete));
  console.log("first audio     :", seconds(marks.first_audio), "<-- ttfa after connect");
  console.log("first transcript:", seconds(marks.first_transcript));
  console.log("turn complete   :", seconds(marks.turn_complete));
  console.log("close           :", JSON.stringify(closed));
  setTimeout(() => process.exit(0), 200);
}
setTimeout(finish, 30000);
