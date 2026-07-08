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
  const migrationsDir = resolve(process.cwd(), "../../supabase/migrations");
  const migrationFiles = [
    "001_initial_schema.sql",
    "003_business_type.sql",
    "004_primary_use_case.sql",
    "005_onboarding_completed.sql",
    "006_salon_appointments.sql",
  ];

  for (const file of migrationFiles) {
    const schema = readFileSync(resolve(migrationsDir, file), "utf8");
    await sql.unsafe(schema);
    console.log(`Applied ${file}.`);
  }

  await sql.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
