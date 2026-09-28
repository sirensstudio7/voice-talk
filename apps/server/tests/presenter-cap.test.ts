import { describe, expect, test } from "bun:test";

/**
 * TKT-007: each presenter viewer holds a narrator slot; the cap rejects the
 * next viewer and releases correctly.
 *
 * Gated like the other service tests because importing the route pulls in
 * `env` (which requires REDIS_URL). SMOKE_TESTS=1 + REDIS_URL.
 */
const hasServices =
  process.env.SMOKE_TESTS === "1" && Boolean(process.env.REDIS_URL);
const suite = hasServices ? describe : describe.skip;

suite("presenter viewer cap", () => {
  test("rejects past the configured cap and frees slots on release", async () => {
    const { env } = await import("../src/env.js");
    const { acquireViewerSlot, releaseViewerSlot } = await import(
      "../src/routes/presentation-websocket.js"
    );

    const sessionId = `cap-probe-${crypto.randomUUID().slice(0, 8)}`;
    const cap = env.PRESENTER_MAX_VIEWERS_PER_SESSION;

    const granted: number[] = [];
    try {
      for (let i = 0; i < cap; i += 1) {
        granted.push(i);
        expect(acquireViewerSlot(sessionId)).toBe(true);
      }
      expect(acquireViewerSlot(sessionId)).toBe(false);
    } finally {
      for (const _ of granted) releaseViewerSlot(sessionId);
    }

    // All slots returned: the same number can be acquired again.
    for (let i = 0; i < cap; i += 1) {
      expect(acquireViewerSlot(sessionId)).toBe(true);
    }
    for (let i = 0; i < cap; i += 1) releaseViewerSlot(sessionId);
    expect(acquireViewerSlot(sessionId)).toBe(true);
    releaseViewerSlot(sessionId);
  });
});
