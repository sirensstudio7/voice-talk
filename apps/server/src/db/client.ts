import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env.js";
import * as schema from "./schema.js";

const usesSupabasePooler =
  env.DATABASE_URL.includes(":6543/") || env.DATABASE_URL.includes("pooler.supabase.com");

const usesTransactionPooler = env.DATABASE_URL.includes(":6543/");

if (usesTransactionPooler) {
  console.warn(
    "[db] DATABASE_URL uses Supabase transaction pooler (:6543). " +
      "Prefer session pooler (:5432) for the Node API to avoid stuck connections.",
  );
}

const client = postgres(env.DATABASE_URL, {
  // Supabase pooler has a low connection cap — keep the pool small.
  prepare: false,
  max: usesSupabasePooler ? 2 : 10,
  connect_timeout: usesSupabasePooler ? 10 : 10,
  // Recycle idle / old sockets so a bad pooler connection cannot linger.
  idle_timeout: usesTransactionPooler ? 5 : 20,
  max_lifetime: usesTransactionPooler ? 60 : 60 * 10,
  // Fail stuck queries instead of holding pool slots forever (login/UI hang).
  connection: {
    statement_timeout: usesSupabasePooler ? 10_000 : 30_000,
  },
});

export const db = drizzle(client, { schema });

export async function closeDb(): Promise<void> {
  await client.end();
}
