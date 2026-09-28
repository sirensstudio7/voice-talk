/**
 * Compare Postgres drivers on identical queries, through Drizzle.
 *
 * Local run (uses the docker-compose Postgres by default):
 *   bun run bench:db
 *
 * Against Aiven, run from a machine in the same region as the service:
 *   DATABASE_URL="postgres://avnadmin:...@pg-xxx.a.aivencloud.com:PORT/defaultdb?sslmode=require" \
 *     bun run bench:db -- --iterations=3000 --concurrency=8 --repeat=3
 *
 * Flags:
 *   --rows=5000         scratch table size
 *   --iterations=2000   measured queries per workload, per driver, per pass
 *   --concurrency=8     concurrent in-flight queries (also the pool size)
 *   --repeat=3          passes per driver; medians are reported
 *   --drivers=postgres,bun-sql
 *   --no-prepare        disable prepared statements (for transaction poolers)
 *
 * The scratch table is created UNLOGGED and dropped on exit, so the target
 * database is left untouched.
 */
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { drizzle as drizzleBun } from "drizzle-orm/bun-sql";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";

type Queryable = { execute: (query: unknown) => Promise<unknown> };

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/voicetalk";

function numberFlag(name: string, fallback: number): number {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const value = Number(raw.slice(`--${name}=`.length));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const rows = numberFlag("rows", 5000);
const iterations = numberFlag("iterations", 2000);
const concurrency = numberFlag("concurrency", 8);
const repeat = numberFlag("repeat", 3);
const noPrepare = process.argv.includes("--no-prepare");
const requested = (
  process.argv.find((arg) => arg.startsWith("--drivers="))?.slice("--drivers=".length) ??
  "postgres,bun-sql"
).split(",");

type Driver = {
  name: string;
  db: Queryable;
  close: () => Promise<void>;
};

function makePostgresDriver(): Driver {
  const client = postgres(DATABASE_URL, {
    max: concurrency,
    prepare: !noPrepare,
    onnotice: () => undefined,
  });
  return {
    name: "postgres",
    db: { execute: (query) => drizzlePg(client).execute(query as never) },
    close: () => client.end({ timeout: 5 }),
  };
}

function makeBunDriver(): Driver {
  const client = new SQL({ url: DATABASE_URL, max: concurrency, prepare: !noPrepare });
  return {
    name: "bun-sql",
    db: { execute: (query) => drizzleBun(client).execute(query as never) },
    close: () => client.close({ timeout: 5 }),
  };
}

function makeDrivers(): Driver[] {
  return [
    { name: "postgres", make: makePostgresDriver },
    { name: "bun-sql", make: makeBunDriver },
  ]
    .filter((entry) => requested.includes(entry.name))
    .map((entry) => entry.make());
}

type Workload = { name: string; run: (db: Queryable) => Promise<unknown> };

const readWorkload: Workload = {
  name: "read",
  run: (db) => db.execute(sql`SELECT v FROM bench_kv WHERE id = ${1 + Math.floor(Math.random() * rows)}`),
};

const writeWorkload: Workload = {
  name: "write",
  run: (db) =>
    db.execute(
      sql`UPDATE bench_kv SET v = ${Math.random().toString(36).slice(2)} WHERE id = ${1 + Math.floor(Math.random() * rows)}`,
    ),
};

type Phase = { durations: number[]; errors: number; wallMs: number; opsPerSec: number };

async function runPhase(
  db: Queryable,
  workload: Workload,
  count: number,
  inFlight: number,
): Promise<Phase> {
  const durations: number[] = [];
  let errors = 0;
  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next++;
      if (index >= count) return;
      const started = performance.now();
      try {
        await workload.run(db);
        durations.push(performance.now() - started);
      } catch {
        errors += 1;
      }
    }
  };
  const started = performance.now();
  await Promise.all(Array.from({ length: inFlight }, worker));
  const wallMs = performance.now() - started;
  return { durations, errors, wallMs, opsPerSec: durations.length / (wallMs / 1000) };
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

type Pass = { p50: number; p95: number; p99: number; opsPerSec: number; errors: number };

function passOf(phase: Phase): Pass {
  const sorted = [...phase.durations].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    opsPerSec: phase.opsPerSec,
    errors: phase.errors,
  };
}

async function main(): Promise<void> {
  const target = new URL(DATABASE_URL);
  console.log(
    `target ${target.host}${target.pathname} (user ${target.username}) | ` +
      `rows=${rows} iterations=${iterations} concurrency=${concurrency} repeat=${repeat} prepare=${!noPrepare}`,
  );

  const drivers = makeDrivers();
  if (drivers.length === 0) throw new Error(`No matching drivers: ${requested.join(",")}`);

  // Schema + data setup happens on the first driver, then is shared.
  const setup = drivers[0]!;
  await setup.db.execute(
    sql`CREATE UNLOGGED TABLE IF NOT EXISTS bench_kv (id integer PRIMARY KEY, v text NOT NULL)`,
  );
  await setup.db.execute(sql`TRUNCATE bench_kv`);
  await setup.db.execute(
    sql`INSERT INTO bench_kv (id, v) SELECT g, md5(g::text) FROM generate_series(1, ${rows}) AS g`,
  );
  const version = (await setup.db.execute(
    sql`SELECT current_setting('server_version') AS v`,
  )) as Array<{ v: string }>;
  console.log(`server ${version[0]?.v ?? "?"}`);

  const results = new Map<string, Map<string, Pass[]>>();
  const rss = new Map<string, { start: number; end: number }>();
  const workloads = [readWorkload, writeWorkload];

  // Warm both drivers before any measurement so neither pays JIT/first-query cost.
  for (const driver of drivers) {
    for (const workload of workloads) {
      await runPhase(driver.db, workload, Math.max(50, concurrency * 25), concurrency);
    }
  }

  for (let pass = 0; pass < repeat; pass++) {
    for (const driver of drivers) {
      if (!rss.has(driver.name)) {
        rss.set(driver.name, { start: process.memoryUsage().rss, end: 0 });
        results.set(driver.name, new Map());
      }
      for (const workload of workloads) {
        const phase = await runPhase(driver.db, workload, iterations, concurrency);
        const passes = results.get(driver.name)!.get(workload.name) ?? [];
        passes.push(passOf(phase));
        results.get(driver.name)!.set(workload.name, passes);
      }
      rss.get(driver.name)!.end = process.memoryUsage().rss;
    }
  }

  console.log(`\n${["driver", "workload", "ops/s", "p50 ms", "p95 ms", "p99 ms", "errors"].join("\t")}`);
  let totalErrors = 0;
  for (const driver of drivers) {
    for (const workload of workloads) {
      const passes = results.get(driver.name)!.get(workload.name) ?? [];
      const clean = passes.filter((pass) => pass.errors === 0);
      const use = clean.length > 0 ? clean : passes;
      totalErrors += passes.reduce((sum, pass) => sum + pass.errors, 0);
      console.log(
        [
          driver.name,
          workload.name,
          median(use.map((p) => p.opsPerSec)).toFixed(0),
          median(use.map((p) => p.p50)).toFixed(3),
          median(use.map((p) => p.p95)).toFixed(3),
          median(use.map((p) => p.p99)).toFixed(3),
          String(passes.reduce((sum, pass) => sum + pass.errors, 0)),
        ].join("\t"),
      );
    }
    const memory = rss.get(driver.name);
    if (memory) {
      console.log(
        `${driver.name}\tRSS Δ\t${((memory.end - memory.start) / 1024 / 1024).toFixed(1)} MB`,
      );
    }
  }

  await setup.db.execute(sql`DROP TABLE IF EXISTS bench_kv`);
  for (const driver of drivers) await driver.close();
  if (totalErrors > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`benchmark failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
