/**
 * Tiny dependency-free metrics registry.
 *
 * There is no Prometheus scraper in this deployment (Kubeletto is a container
 * platform, not a metrics stack), so counters live in-process and are exposed
 * as JSON on `/health?metrics=1`. Keep names low-cardinality — no business
 * slugs or session ids — so the snapshot stays small and scrape-friendly.
 */

const counters = new Map<string, number>();
const gauges = new Map<string, number>();

export function inc(name: string, by = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + by);
}

export function setGauge(name: string, value: number): void {
  gauges.set(name, value);
}

export function metricsSnapshot(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, value] of counters) out[name] = value;
  for (const [name, value] of gauges) out[name] = value;
  return out;
}
