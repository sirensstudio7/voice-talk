import { SQL } from "bun";
import { drizzle, type BunSQLDatabase } from "drizzle-orm/bun-sql";

import { env } from "../env.js";
import * as schema from "./schema.js";

type AppDb = BunSQLDatabase<typeof schema>;

const LOGIN_DB_TIMEOUT_MS = 30_000;

/**
 * Run auth lookups on a disposable 1-connection client.
 *
 * The shared pool can stall under pooler pressure; /health already bypasses
 * it, and login must do the same or the UI times out while health still
 * looks green.
 */
export async function withLoginDb<T>(fn: (db: AppDb) => Promise<T>): Promise<T> {
  const client = new SQL({
    url: env.DATABASE_URL,
    prepare: false,
    max: 1,
    connectionTimeout: 25,
    idleTimeout: 5,
    maxLifetime: 30,
    connection: {
      statement_timeout: 10_000,
      application_name: "voice-talk-api-login",
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
    await client.close({ timeout: 1 }).catch(() => {
      // Connection may already be closed after timeout.
    });
  }
}
