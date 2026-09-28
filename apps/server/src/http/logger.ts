/**
 * Structured logger for the API process.
 *
 * Every production line is one newline-delimited JSON object on stdout:
 *
 *   {"time":"2026-09-28T12:00:00.000Z","level":30,"severity":"INFO",
 *    "service":"voicetalk-server","env":"production","pid":1,
 *    "msg":"http.request","requestId":"…","method":"GET","path":"/health","status":200}
 *
 * Contract:
 * - `msg` is a stable event name (`http.request`, `ws.session`, `vision.trigger`).
 *   Context goes in fields, never interpolated into the message, so a collector
 *   can filter on `businessSlug=…` or `reason=…` without parsing prose.
 * - Levels use pino numbering (debug=20 … error=50). `severity` carries the
 *   cloud-logging name (DEBUG/INFO/WARNING/ERROR) so collectors promote lines
 *   without a parser.
 * - Errors serialize as `{ type, message, stack, code?, cause? }`.
 * - Known secret keys (password, token, api key, …) are redacted.
 * - `GIT_SHA` (baked into CI images) is logged as `version` on every line, so
 *   an incident can be correlated with the build that caused it.
 * - `LOG_LEVEL` is read from `process.env` here, not from `env.ts`: this module
 *   loads at import time for every entrypoint and must not pull in the env
 *   schema (or form an import cycle with it).
 * - `logger.child({ component: "live" })` binds fields onto every line.
 * - Code running inside a request picks up `requestId`/`method`/`path` from
 *   `logContext` automatically; set with `logContext.run()` or `enterWith()`.
 *
 * Noise policy (why production stays readable):
 * - One line per request, per session transition, per job failure — never per
 *   audio frame or per vision event. Per-frame internals stay at `debug`.
 * - 404 access lines are `debug`: unknown paths are continuously probed by
 *   scanners and would otherwise dominate the access stream.
 * - Errors that repeat per client frame (malformed sockets, poison messages)
 *   pass through `shouldLogThrottled`, so a misbehaving peer cannot flood the
 *   log collector. The first occurrence always lands.
 * - Background jobs log only when they changed something (count > 0).
 *
 * stdout NDJSON is the contract for the container log collector. No shipping
 * SDK belongs in this process; see the running notes in the Dockerfile.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type Logger = {
  debug: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  /** Bind fields (component, businessSlug, …) onto every line this logger emits. */
  child: (bindings: Record<string, unknown>) => Logger;
};

/** Async-local fields attached to every line emitted inside a request. */
export type LogContext = {
  requestId?: string;
  method?: string;
  path?: string;
};

type Sink = (line: string, level: LogLevel) => void;

const LEVELS = { debug: 20, info: 30, warn: 40, error: 50 } as const;
const SEVERITY = { debug: "DEBUG", info: "INFO", warn: "WARNING", error: "ERROR" } as const;

const SERVICE = "voicetalk-server";

/** Request context, set once per request by the request-logging hooks. */
export const logContext = new AsyncLocalStorage<LogContext>();

function resolveLevel(): LogLevel {
  const configured = (process.env.LOG_LEVEL ?? "").trim().toLowerCase();
  if (configured in LEVELS) return configured as LogLevel;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

let threshold: number = LEVELS[resolveLevel()];

function defaultSink(line: string, level: LogLevel): void {
  if (level === "error") console.error(line);
  else console.log(line);
}

let sink: Sink = defaultSink;

/** Test-only: capture lines instead of writing them. Pass `null` to restore. */
export function __setLogSink(next: Sink | null): void {
  sink = next ?? defaultSink;
}

/** Test-only: pin the level threshold. Pass `null` to recompute from the env. */
export function __setLogLevel(next: LogLevel | null): void {
  threshold = LEVELS[next ?? resolveLevel()];
}

/**
 * Throttle for events that repeat per client frame (malformed socket data,
 * poison messages). Returns true when the key may emit now: at most one line
 * per window per key. Keys should identify the source (event + session id) so
 * distinct incidents are not collapsed into each other.
 */
const throttledUntil = new Map<string, number>();

export function shouldLogThrottled(key: string, windowMs = 10_000): boolean {
  const now = Date.now();
  const until = throttledUntil.get(key);
  if (until !== undefined && now < until) return false;

  if (throttledUntil.size >= 4096) {
    for (const [k, expiry] of throttledUntil) {
      if (expiry <= now) throttledUntil.delete(k);
    }
    // A burst of unique keys must not grow the map without bound; resetting
    // briefly loses throttle state, which is strictly better than a leak.
    if (throttledUntil.size >= 4096) throttledUntil.clear();
  }

  throttledUntil.set(key, now + windowMs);
  return true;
}

/**
 * Secret detection is name-based, because values can be anything. Keys are
 * normalised (`x-api-key` → `xapikey`, `accessToken` → `accesstoken`) so the
 * common spellings of the same secret all match.
 */
function isSecretKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!normalized) return false;
  if (normalized === "authorization" || normalized === "pin" || normalized === "setcookie") {
    return true;
  }
  if (normalized.includes("password") || normalized.includes("secret")) return true;
  for (const suffix of ["token", "apikey", "cookie", "totp", "jwt", "credential"]) {
    if (normalized.endsWith(suffix)) return true;
  }
  return false;
}

/** JSON replacer: turns Errors into plain objects and redacts secret fields. */
function replacer(key: string, value: unknown): unknown {
  if (isSecretKey(key)) return "[redacted]";
  if (value instanceof Error) {
    const out: Record<string, unknown> = {
      type: value.name,
      message: value.message,
      stack: value.stack,
    };
    const code = (value as Error & { code?: unknown }).code;
    if (code !== undefined) out.code = code;
    if (value.cause !== undefined) out.cause = value.cause;
    return out;
  }
  return value;
}

function emit(
  level: LogLevel,
  bindings: Record<string, unknown> | undefined,
  obj: unknown,
  msg?: string,
): void {
  if (LEVELS[level] < threshold) return;

  const base: Record<string, unknown> = {
    time: new Date().toISOString(),
    level: LEVELS[level],
    severity: SEVERITY[level],
    service: SERVICE,
    env: process.env.NODE_ENV ?? "development",
    pid: process.pid,
  };
  if (process.env.HOSTNAME) base.instance = process.env.HOSTNAME;
  if (process.env.GIT_SHA) base.version = process.env.GIT_SHA;

  if (bindings) Object.assign(base, bindings);
  const context = logContext.getStore();
  if (context) Object.assign(base, context);

  if (obj instanceof Error) {
    base.err = obj;
  } else if (obj && typeof obj === "object") {
    Object.assign(base, obj);
  } else if (obj !== undefined) {
    base.msg = obj;
  }
  if (msg !== undefined) base.msg = msg;

  try {
    sink(JSON.stringify(base, replacer), level);
  } catch {
    // Logging must never take down the request path. BigInts and circular
    // structures are the usual suspects; emit a minimal line instead.
    sink(
      JSON.stringify({
        time: new Date().toISOString(),
        level: LEVELS[level],
        severity: SEVERITY[level],
        service: SERVICE,
        pid: process.pid,
        msg: msg ?? (typeof obj === "string" ? obj : "log.serialization_failed"),
      }),
      level,
    );
  }
}

function createLogger(bindings?: Record<string, unknown>): Logger {
  const at = (level: LogLevel) => (obj: unknown, msg?: string) =>
    emit(level, bindings, obj, msg);
  return {
    debug: at("debug"),
    info: at("info"),
    warn: at("warn"),
    error: at("error"),
    child: (extra) => createLogger({ ...bindings, ...extra }),
  };
}

/** Process-wide root logger. Prefer `logger.child({ component })` per module. */
export const logger: Logger = createLogger();
