import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

/**
 * TKT-006: instance presence powers the LIVE single-instance guard.
 * Opt-in like the smoke tests: SMOKE_TESTS=1 + REDIS_URL.
 */
const hasRedis =
  process.env.SMOKE_TESTS === "1" && Boolean(process.env.REDIS_URL);
const suite = hasRedis ? describe : describe.skip;

suite("instance registry", () => {
  test("counts heartbeat keys and rejects LIVE when several exist", async () => {
    const { redis } = await import("../src/redis.js");
    const { activeInstanceCount, assertSingleInstanceForLive } = await import(
      "../src/services/instance-registry.js"
    );

    const suffix = randomUUID().slice(0, 8);
    const keys = [
      `instances:heartbeat:test-a-${suffix}`,
      `instances:heartbeat:test-b-${suffix}`,
    ];

    try {
      await redis.set(keys[0]!, "1", "EX", String(30));
      expect(await activeInstanceCount()).toBeGreaterThanOrEqual(1);

      await redis.set(keys[1]!, "1", "EX", String(30));
      expect(await activeInstanceCount()).toBeGreaterThanOrEqual(2);
      await expect(assertSingleInstanceForLive()).rejects.toThrow(/single-instance/);
    } finally {
      for (const key of keys) {
        await redis.del(key);
      }
    }
  });
});
