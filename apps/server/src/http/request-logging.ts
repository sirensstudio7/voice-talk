/**
 * HTTP request correlation and access logging.
 *
 * Registered on the root app before any route (alongside `onError`) so the
 * `precompile` router attaches the hooks to every route.
 *
 * - `onRequest` assigns every request a `requestId`: an inbound `x-request-id`
 *   is honoured when it looks sane (proxy correlation), otherwise one is
 *   generated. The id is echoed on the response and published on `logContext`,
 *   so any service called from a route logs the request it served.
 * - `onAfterResponse` emits one `http.request` line with status and duration.
 *   Elysia runs after-response hooks from a `setImmediate`, outside the
 *   request's async context, so the start time is kept in a WeakMap keyed by
 *   the `Request` object rather than in async-local storage.
 * - Health checks and static uploads are skipped: they are infrastructure
 *   noise, and `/health` may be polled every few seconds.
 */
import type { Elysia } from "elysia";
import { logContext, logger } from "./logger.js";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

type RequestState = { requestId: string; startedAt: number };

const pending = new WeakMap<Request, RequestState>();

const log = logger.child({ component: "http" });

function shouldLog(pathname: string, method: string): boolean {
  if (method === "OPTIONS") return false;
  if (pathname === "/health") return false;
  if (pathname.startsWith("/uploads/")) return false;
  return true;
}

export function registerRequestLogging(app: Elysia): void {
  app.onRequest(({ request, set }) => {
    const inbound = request.headers.get("x-request-id") ?? "";
    const requestId = REQUEST_ID_PATTERN.test(inbound) ? inbound : crypto.randomUUID();
    const { pathname } = new URL(request.url);

    pending.set(request, { requestId, startedAt: performance.now() });
    set.headers["x-request-id"] = requestId;

    // AsyncLocalStorage.enterWith covers the rest of this fetch's execution
    // chain: route handlers and every service they await.
    logContext.enterWith({ requestId, method: request.method, path: pathname });
  });

  app.onAfterResponse(({ request, set }) => {
    const state = pending.get(request);
    if (!state) return;
    pending.delete(request);

    const { pathname } = new URL(request.url);
    if (!shouldLog(pathname, request.method)) return;

    const status = typeof set.status === "number" ? set.status : Number(set.status) || 200;
    const fields = {
      requestId: state.requestId,
      method: request.method,
      path: pathname,
      status,
      durationMs: Math.round(performance.now() - state.startedAt),
    };

    // Access-line levels: 5xx is an incident signal (error), a request for an
    // unknown path is almost always a scanner (debug), everything else is one
    // info line per request. 4xx stay at info so auth/validation spikes remain
    // visible; they never reach the error channel.
    if (status >= 500) log.error(fields, "http.request");
    else if (status === 404) log.debug(fields, "http.request");
    else log.info(fields, "http.request");
  });
}
