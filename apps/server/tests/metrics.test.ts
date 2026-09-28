import { describe, expect, test } from "bun:test";
import { inc, metricsSnapshot, observe, setGauge } from "../src/http/metrics.js";

/** TKT-015: the observation helper is dependency-free, so it runs always. */
describe("metrics", () => {
  test("counters and gauges land in the snapshot", () => {
    inc("test.counter_total", 2);
    inc("test.counter_total");
    setGauge("test.gauge", 7);

    const snapshot = metricsSnapshot();
    expect(snapshot["test.counter_total"]).toBe(3);
    expect(snapshot["test.gauge"]).toBe(7);
  });

  test("observe aggregates count, average, max and fixed buckets", () => {
    observe("test.observe_ms", 60);
    observe("test.observe_ms", 300);

    const snapshot = metricsSnapshot();
    expect(snapshot["test.observe_ms.count"]).toBe(2);
    expect(snapshot["test.observe_ms.avg_ms"]).toBe(180);
    expect(snapshot["test.observe_ms.max_ms"]).toBe(300);
    expect(snapshot["test.observe_ms.le_50ms"]).toBe(0);
    expect(snapshot["test.observe_ms.le_100ms"]).toBe(1);
    expect(snapshot["test.observe_ms.le_500ms"]).toBe(1);
  });

  test("observe clamps garbage input instead of poisoning the average", () => {
    observe("test.observe_garbage_ms", Number.NaN);
    observe("test.observe_garbage_ms", -5);

    const snapshot = metricsSnapshot();
    expect(snapshot["test.observe_garbage_ms.count"]).toBe(2);
    expect(snapshot["test.observe_garbage_ms.avg_ms"]).toBe(0);
  });
});
