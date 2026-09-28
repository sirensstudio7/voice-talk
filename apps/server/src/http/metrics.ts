/**
 * Tiny dependency-free metrics registry.
 *
 * There is no Prometheus scraper in this deployment (Kubeletto is a container
 * platform, not a metrics stack), so counters live in-process and are exposed
 * as JSON on `/health?metrics=1`. Keep names low-cardinality — no business
 * slugs or session ids — so the snapshot stays small and scrape-friendly.
 *
 * Latency is tracked with fixed buckets instead of a histogram library: enough
 * for p50/p95 estimates (`*.le_250ms` etc.) without another dependency.
 */

const counters = new Map<string, number>();
const gauges = new Map<string, number>();

export const OBSERVATION_BUCKETS_MS = [50, 100, 250, 500, 1000, 2500, 5000] as const;

type Observation = {
  count: number;
  sumMs: number;
  maxMs: number;
  buckets: number[];
};

const observations = new Map<string, Observation>();

export function inc(name: string, by = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + by);
}

export function setGauge(name: string, value: number): void {
  gauges.set(name, value);
}

/** Record one latency sample (milliseconds) under a low-cardinality name. */
export function observe(name: string, ms: number): void {
  const value = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  let entry = observations.get(name);
  if (!entry) {
    entry = { count: 0, sumMs: 0, maxMs: 0, buckets: OBSERVATION_BUCKETS_MS.map(() => 0) };
    observations.set(name, entry);
  }
  entry.count += 1;
  entry.sumMs += value;
  if (value > entry.maxMs) entry.maxMs = value;
  const index = OBSERVATION_BUCKETS_MS.findIndex((bound) => value <= bound);
  entry.buckets[index === -1 ? OBSERVATION_BUCKETS_MS.length - 1 : index] += 1;
}

export function metricsSnapshot(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, value] of counters) out[name] = value;
  for (const [name, value] of gauges) out[name] = value;
  for (const [name, entry] of observations) {
    out[`${name}.count`] = entry.count;
    out[`${name}.avg_ms`] = Math.round(entry.sumMs / entry.count);
    out[`${name}.max_ms`] = Math.round(entry.maxMs);
    OBSERVATION_BUCKETS_MS.forEach((bound, index) => {
      out[`${name}.le_${bound}ms`] = entry.buckets[index]!;
    });
  }
  return out;
}
