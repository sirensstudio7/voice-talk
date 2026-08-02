import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "../env.js";
import * as schema from "./schema.js";

type AppDb = PostgresJsDatabase<typeof schema>;

const LOGIN_DB_TIMEOUT_MS = 12_000;

/**
 * Run auth lookups on a disposable 1-connection client.
 *
 * The shared pool can stall under Supabase pooler pressure; /health already
 * bypasses it, and login must do the same or the UI times out while health
 * still looks green.
 */
export async function withLoginDb<T>(fn: (db: AppDb) => Promise<T>): Promise<T> {
  const client = postgres(env.DATABASE_URL, {
    prepare: false,
    max: 1,
    connect_timeout: 10,
    idle_timeout: 5,
    max_lifetime: 30,
    connection: {
      statement_timeout: 10_000,
    },
  });
  const loginDb = drizzle(client, { schema });

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(loginDb),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(
            "Login database timed out. Please retry in a moment.",
          ) as Error & { statusCode: number };
          err.statusCode = 503;
          reject(err);
        }, LOGIN_DB_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    await client.end({ timeout: 1 }).catch(() => {
      // Connection may already be closed after timeout.
    });
  }
}
