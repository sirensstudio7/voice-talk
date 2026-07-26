import { sql } from "drizzle-orm";
import { db } from "./client.js";

export type DbHealth = {
  online: boolean;
  latencyMs: number | null;
  error?: string;
};

const CACHE_TTL_MS = 30_000;
let cachedHealth: DbHealth | null = null;
let cachedAt = 0;
let inflightCheck: Promise<DbHealth> | null = null;

async function pingDb(timeoutMs: number): Promise<DbHealth> {
  const started = Date.now();

  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Database ping timed out")), timeoutMs);
      }),
    ]);

    return { online: true, latencyMs: Date.now() - started };
  } catch (error) {
    return {
      online: false,
      latencyMs: null,
      error: error instanceof Error ? error.message : "Database unreachable",
    };
  }
}

export async function checkDbHealth(timeoutMs = 5000, force = false): Promise<DbHealth> {
  const now = Date.now();
  if (!force && cachedHealth && now - cachedAt < CACHE_TTL_MS) {
    return cachedHealth;
  }

  if (!force && inflightCheck) {
    return inflightCheck;
  }

  inflightCheck = pingDb(timeoutMs).then((result) => {
    cachedHealth = result;
    cachedAt = Date.now();
    return result;
  });

  try {
    return await inflightCheck;
  } finally {
    inflightCheck = null;
  }
}

export async function warmDbConnection(): Promise<void> {
  const health = await checkDbHealth(15_000, true);
  if (!health.online) {
    console.warn(`Database warmup failed: ${health.error ?? "unknown error"}`);
    return;
  }
  console.info(`Database connected (${health.latencyMs}ms)`);
}
