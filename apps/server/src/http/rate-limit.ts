import { rateLimit } from "../redis.js";
import { inc } from "./metrics.js";

/**
 * Per-IP limits for public (unauthenticated) endpoints, on top of the existing
 * kiosk-unlock and platform-login limiters.
 *
 * Fixed windows shared across instances through Redis; `rateLimit` fails open
 * when Redis is unavailable. Slugs are part of the key where the endpoint knows
 * one, so a busy venue behind shared NAT cannot exhaust another venue's budget.
 * Limits are deliberately generous (a kiosk counts as one IP) — tune down only
 * after watching `rate_limit.denied.*` for a day.
 */
export const RATE_LIMITS = {
  spin: { bucket: "spin", limit: 30, windowMs: 15 * 60_000 },
  orderConfirm: { bucket: "order_confirm", limit: 20, windowMs: 15 * 60_000 },
  appointmentCreate: { bucket: "appointment_create", limit: 10, windowMs: 15 * 60_000 },
  photoStart: { bucket: "photo_start", limit: 20, windowMs: 15 * 60_000 },
  photoUpload: { bucket: "photo_upload", limit: 30, windowMs: 15 * 60_000 },
  photoComplete: { bucket: "photo_complete", limit: 20, windowMs: 15 * 60_000 },
  photoEvent: { bucket: "photo_event", limit: 120, windowMs: 60_000 },
  bannerEvent: { bucket: "banner_event", limit: 120, windowMs: 60_000 },
  demoRequest: { bucket: "demo_request", limit: 5, windowMs: 15 * 60_000 },
  merchantLogin: { bucket: "merchant_login", limit: 10, windowMs: 15 * 60_000 },
} as const satisfies Record<string, { bucket: string; limit: number; windowMs: number }>;

export type RateLimitRule = { bucket: string; limit: number; windowMs: number };

export const RATE_LIMIT_DETAIL =
  "Too many requests. Please wait a moment and try again.";

type RequestLike = {
  headers: Record<string, string | undefined>;
  request: Request;
  server?: { requestIP?: (request: Request) => { address: string } | null } | null;
};

export function requestIp(request: RequestLike): string {
  const forwarded = (request.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim();
  return forwarded || request.server?.requestIP?.(request.request)?.address || "unknown";
}

/**
 * True when the request is within budget. Denials are counted before returning
 * so `/health?metrics=1` shows pressure per bucket.
 */
export async function allowPublicRequest(
  request: RequestLike,
  rule: RateLimitRule,
  scope?: string,
): Promise<boolean> {
  const key = `ratelimit:${rule.bucket}:${scope ? `${scope}:` : ""}${requestIp(request)}`;
  const allowed = await rateLimit(key, rule.limit, rule.windowMs);
  if (!allowed) {
    inc("rate_limit.denied_total");
    inc(`rate_limit.denied.${rule.bucket}`);
  }
  return allowed;
}
