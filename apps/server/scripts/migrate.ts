import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: resolve(process.cwd(), "../../.env") });
config();

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/voicetalk";

async function migrate() {
  const sql = postgres(DATABASE_URL, { max: 1 });
  const schemaPath = resolve(process.cwd(), "../../supabase/migrations/001_initial_schema.sql");
  const schema = readFileSync(schemaPath, "utf8");
  await sql.unsafe(schema);
  console.log("Applied schema migration.");
  await sql.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
