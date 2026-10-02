#!/usr/bin/env bun
/**
 * Voice websocket probe (TKT-014).
 *
 * Connects to `/ws/session`, sends `session.greeting`, and reports what came
 * back: session status, first assistant transcript, and first audio frame
 * (latency from greeting). Exits 0 when the assistant responded, 2 when it
 * stayed silent for the whole timeout, 3 when the socket failed.
 *
 * Usage:
 *   bun scripts/ws-probe.ts --url wss://lorescale-api.kubeletto.app/ws/session?business=lorescale
 *   bun scripts/ws-probe.ts --business sunrise-coffee --language id --timeout 30
 *
 * Flags: --url --business --language --source --timeout
 * Env fallbacks: WS_PROBE_URL, WS_PROBE_BUSINESS, WS_PROBE_LANGUAGE.
 */

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i]!;
    if (arg === `--${name}`) return process.argv[i + 1];
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return process.env[`WS_PROBE_${name.toUpperCase().replace(/-/g, "_")}`];
}

const rawUrl = flag("url") ?? "ws://localhost:8000/ws/session";
const business = flag("business") ?? "sunrise-coffee";
const language = flag("language") ?? "id";
const source = flag("source") ?? "manual";
const timeoutMs = Number(flag("timeout") ?? "30") * 1000;

const url = new URL(rawUrl);
if (!url.searchParams.get("business")) url.searchParams.set("business", business);
if (!url.searchParams.get("language")) url.searchParams.set("language", language);

const started = performance.now();
let sawConnectedStatus = false;
let firstTranscriptMs: number | null = null;
let firstAudioMs: number | null = null;
let errorPayload: string | null = null;
let closed = false;

const socket = new WebSocket(url);
socket.binaryType = "arraybuffer";

const elapsed = () => Math.round(performance.now() - started);

socket.onopen = () => {
  console.log(`[${elapsed()}ms] open ${url.toString()}`);
  socket.send(JSON.stringify({ type: "session.greeting", source }));
  console.log(`[${elapsed()}ms] sent session.greeting (source=${source})`);
};

socket.onmessage = (event) => {
  const data = event.data;

  if (typeof data !== "string") {
    if (firstAudioMs === null) {
      firstAudioMs = elapsed();
      console.log(`[${firstAudioMs}ms] first audio frame (${(data as ArrayBuffer).byteLength} bytes)`);
    }
    return;
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return;
  }

  const type = String(payload.type ?? "");
  if (type === "session.status") {
    const status = String(payload.status ?? "");
    if (status === "connected") sawConnectedStatus = true;
    console.log(`[${elapsed()}ms] session.status ${status}`);
    return;
  }
  if (type === "transcript.assistant") {
    if (firstTranscriptMs === null) firstTranscriptMs = elapsed();
    console.log(`[${elapsed()}ms] assistant: ${String(payload.text ?? "")}`);
    return;
  }
  if (type === "transcript.user") {
    console.log(`[${elapsed()}ms] user: ${String(payload.text ?? "")}`);
    return;
  }
  if (type === "error") {
    errorPayload = String(payload.error ?? "unknown error");
    console.log(`[${elapsed()}ms] server error: ${errorPayload}`);
  }
};

socket.onerror = () => {
  console.log(`[${elapsed()}ms] websocket error`);
};

socket.onclose = (event) => {
  closed = true;
  console.log(`[${elapsed()}ms] closed code=${event.code} reason=${event.reason || "-"}`);
};

await new Promise((resolve) => setTimeout(resolve, timeoutMs));

const responded = firstAudioMs !== null || firstTranscriptMs !== null;
console.log("---");
console.log(`url:             ${url.toString()}`);
console.log(`session.status:  ${sawConnectedStatus ? "connected" : "never connected"}`);
console.log(`first audio:     ${firstAudioMs === null ? "none" : `${firstAudioMs}ms`}`);
console.log(`first transcript:${firstTranscriptMs === null ? " none" : ` ${firstTranscriptMs}ms`}`);
if (errorPayload) console.log(`server error:    ${errorPayload}`);

if (!responded) {
  console.log("RESULT: silent — no audio or assistant transcript within the timeout.");
  process.exit(closed ? 2 : 3);
}
console.log("RESULT: ok — the assistant responded.");
socket.close();
process.exit(0);
