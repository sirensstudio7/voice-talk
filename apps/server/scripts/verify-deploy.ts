#!/usr/bin/env bun
/**
 * Post-deploy verification (TKT-016).
 *
 * Read-only: checks health, metrics and the kiosk `/menu` contract. It never
 * starts a voice session, so it consumes no Gemini minutes and writes nothing.
 *
 * Usage:
 *   bun run verify:deploy -- --url https://api.example.com --business lorescale
 *   bun scripts/verify-deploy.ts --url http://localhost:8000
 *
 * Flags: --url --business --timeout (seconds) --skip-menu
 * Env fallbacks: VERIFY_DEPLOY_URL, VERIFY_DEPLOY_BUSINESS
 *
 * Exit code: 0 when nothing failed (warnings allowed), 1 when a check failed.
 */

type CheckStatus = "pass" | "warn" | "fail";
type Check = { name: string; status: CheckStatus; detail: string };

const checks: Check[] = [];

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i]!;
    if (arg === `--${name}`) return process.argv[i + 1];
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return process.env[`VERIFY_DEPLOY_${name.toUpperCase().replace(/-/g, "_")}`];
}

function record(status: CheckStatus, name: string, detail: string): void {
  checks.push({ name, status, detail });
  const label = status === "pass" ? "PASS" : status === "warn" ? "WARN" : "FAIL";
  console.log(`  ${label}  ${name.padEnd(24)} ${detail}`);
}

const baseUrl = (flag("url") ?? "http://localhost:8000").replace(/\/+$/, "");
const business = flag("business") ?? "sunrise-coffee";
const timeoutMs = Number(flag("timeout") ?? "15") * 1000;
const skipMenu = flag("skip-menu") === "1";

async function getJson(path: string): Promise<{ status: number; body: unknown; ms: number }> {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "application/json" },
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body, ms: performance.now() - started };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

const MENU_KEYS = [
  "business",
  "slug",
  "assistant_name",
  "capabilities",
  "vision",
  "smart_photo_moment",
  "lucky_spin",
  "campaign_banner",
  "languages",
  "booking",
  "products",
];

console.log(`verify-deploy — ${baseUrl} (business=${business})`);
console.log("");

try {
  const health = await getJson("/health?db=1");
  const body = asRecord(health.body);
  if (health.status !== 200) {
    record("fail", "health (db=1)", `HTTP ${health.status}`);
  } else if (body.db_online === true && body.redis_online === true) {
    record(
      "pass",
      "health (db=1)",
      `status=${String(body.status)} db=online redis=online (${Math.round(health.ms)}ms)`,
    );
  } else {
    record(
      "fail",
      "health (db=1)",
      `status=${String(body.status)} db=${String(body.db_online)} redis=${String(body.redis_online)}`,
    );
  }
} catch (error) {
  record("fail", "health (db=1)", error instanceof Error ? error.message : "request failed");
}

try {
  const metrics = await getJson("/health?metrics=1");
  const body = asRecord(metrics.body);
  const snapshot = asRecord(body.metrics);
  if (metrics.status !== 200 || Object.keys(snapshot).length === 0) {
    record("warn", "metrics", "no metrics snapshot (older image? /health?metrics=1)");
  } else {
    const subscribed = snapshot["kiosk_bus.subscribed"];
    const summary = [
      `kiosk_bus.subscribed=${String(subscribed ?? "?")}`,
      `ws.connections_active=${String(snapshot["ws.connections_active"] ?? "?")}`,
      `menu.hits=${String(snapshot["menu.cache_hits_total"] ?? "?")}`,
      `rate_limit.denied=${String(snapshot["rate_limit.denied_total"] ?? "?")}`,
    ].join(" ");
    if (subscribed === 1) {
      record("pass", "metrics", summary);
    } else if (subscribed === undefined) {
      record("warn", "metrics", `${summary} (kiosk bus metric missing — older image?)`);
    } else {
      record("warn", "metrics", `${summary} (kiosk bus not subscribed yet?)`);
    }
  }
} catch (error) {
  record("warn", "metrics", error instanceof Error ? error.message : "request failed");
}

if (!skipMenu) {
  try {
    const first = await getJson(`/menu?business=${encodeURIComponent(business)}`);
    const payload = asRecord(first.body);
    const missing = MENU_KEYS.filter((key) => !(key in payload));
    if (first.status !== 200) {
      record("fail", "menu contract", `HTTP ${first.status}`);
    } else if (missing.length > 0) {
      record("fail", "menu contract", `missing keys: ${missing.join(", ")}`);
    } else {
      // Second call shows the warm-cache latency when the cache is deployed.
      const second = await getJson(`/menu?business=${encodeURIComponent(business)}`);
      const products = Array.isArray(payload.products) ? payload.products.length : 0;
      const detail = `products=${products} cold=${Math.round(first.ms)}ms warm=${Math.round(second.ms)}ms`;
      record(first.ms > 1500 ? "warn" : "pass", "menu contract", detail);
    }
  } catch (error) {
    record("fail", "menu contract", error instanceof Error ? error.message : "request failed");
  }
}

const failed = checks.filter((check) => check.status === "fail").length;
const warned = checks.filter((check) => check.status === "warn").length;
const passed = checks.filter((check) => check.status === "pass").length;
console.log("");
console.log(`RESULT: ${passed} passed, ${warned} warning(s), ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
