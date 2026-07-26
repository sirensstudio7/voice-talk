import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), "../../.env.local"), override: true });
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
    "007_assistant_avatar.sql",
    "008_conversation_end_reason.sql",
    "009_ai_rules_idle_timeout.sql",
    "010_vision_settings.sql",
    "011_knowledge_entry_title.sql",
    "012_display_orientation.sql",
    "013_display_orientation_default_landscape.sql",
    "014_greeting_trigger_mode.sql",
    "015_raise_hand_trigger_mode.sql",
    "016_vision_source.sql",
  ];

  for (const file of migrationFiles) {
    const schema = readFileSync(resolve(migrationsDir, file), "utf8");
    try {
      await sql.unsafe(schema);
      console.log(`Applied ${file}.`);
    } catch (err) {
      if (file === "007_assistant_avatar.sql") {
        await sql.unsafe(`
          ALTER TABLE ai_rules
            ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '';
        `);
        console.log(`Applied ${file} (schema only; skipped Supabase storage policies).`);
        continue;
      }
      throw err;
    }
  }

  await sql.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
