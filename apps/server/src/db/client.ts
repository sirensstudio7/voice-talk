import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env.js";
import * as schema from "./schema.js";

const usesSupabasePooler =
  env.DATABASE_URL.includes(":6543/") || env.DATABASE_URL.includes("pooler.supabase.com");

const client = postgres(env.DATABASE_URL, {
  // Supabase pooler (port 6543) has a low connection cap — keep the pool small.
  // Direct/local Postgres can safely use more connections for parallel dashboard loads.
  prepare: false,
  max: usesSupabasePooler ? 3 : 10,
  connect_timeout: usesSupabasePooler ? 20 : 10,
  idle_timeout: 20,
  max_lifetime: 60 * 10,
});

export const db = drizzle(client, { schema });

export async function closeDb(): Promise<void> {
  await client.end();
}
