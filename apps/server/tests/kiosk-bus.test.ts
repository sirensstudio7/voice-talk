import { describe, expect, test } from "bun:test";
import { RedisClient } from "bun";

/**
 * Cross-instance fanout and singleton-job locks against a real Redis.
 *
 * Opt-in like the smoke tests: SMOKE_TESTS=1 + REDIS_URL (CI provides both).
 * A plain `bun test` skips these; `bun run test:with-services` runs them.
 */
const hasRedis =
  process.env.SMOKE_TESTS === "1" && Boolean(process.env.REDIS_URL);
const suite = hasRedis ? describe : describe.skip;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

suite("kiosk bus", () => {
  test("delivers another instance's payload and ignores its own origin", async () => {
    const { KIOSK_BUS_CHANNEL, instanceId, startKioskBus, stopKioskBus } = await import(
      "../src/services/kiosk-bus.js"
    );
    const received: Array<{ slug: string; payload: Record<string, unknown> }> = [];
    startKioskBus((slug, payload) => {
      received.push({ slug, payload });
    });

    const publisher = new RedisClient(process.env.REDIS_URL!);
    try {
      // Subscription setup is async; retry publish until the handler sees one.
      const deadline = Date.now() + 5_000;
      while (received.length === 0 && Date.now() < deadline) {
        await publisher.publish(
          KIOSK_BUS_CHANNEL,
          JSON.stringify({
            origin: "another-instance",
            businessSlug: "sunrise-coffee",
            payload: { type: "booking.config", active: true },
          }),
        );
        await sleep(100);
      }

      expect(received.length).toBeGreaterThan(0);
      expect(received[0]!.slug).toBe("sunrise-coffee");
      expect(received[0]!.payload.type).toBe("booking.config");

      // The publishing instance must not re-apply its own fanout message.
      const before = received.length;
      await publisher.publish(
        KIOSK_BUS_CHANNEL,
        JSON.stringify({
          origin: instanceId,
          businessSlug: "sunrise-coffee",
          payload: { type: "lucky_spin.config" },
        }),
      );
      await sleep(250);
      expect(received.length).toBe(before);
    } finally {
      publisher.close();
      stopKioskBus();
    }
  });
});

suite("interval lock", () => {
  test("runs a job at most once per bucket across callers", async () => {
    const { withIntervalLock } = await import("../src/redis.js");
    const name = `test-interval-${crypto.randomUUID()}`;
    let runs = 0;
    const job = async () => {
      runs += 1;
    };

    expect(await withIntervalLock(name, 60_000, job)).toBe(true);
    expect(await withIntervalLock(name, 60_000, job)).toBe(false);
    expect(runs).toBe(1);
  });
});
