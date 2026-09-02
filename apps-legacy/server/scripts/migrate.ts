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
    "017_ai_rules_voice_preset.sql",
    "018_dark_beast_voice_preset.sql",
    "019_platform_admin.sql",
    "020_registration_approval.sql",
    "021_demo_requests.sql",
    "022_demo_requests_country.sql",
    "023_demo_requests_schedule.sql",
    "024_account_subscriptions.sql",
    "025_user_country.sql",
    "026_ai_rules_avatar_model_path.sql",
    "027_smart_photo_moment.sql",
    "028_addon_payment_proof.sql",
    "029_addon_transaction_code.sql",
    "030_ai_presenter.sql",
    "031_presentation_slide_image.sql",
    "032_ai_rules_voice_gender.sql",
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
      if (file === "027_smart_photo_moment.sql") {
        const tablesOnly = schema.split("-- Private photo bucket")[0] ?? schema;
        try {
          await sql.unsafe(tablesOnly);
          console.log(`Applied ${file} (schema only; skipped Supabase storage policies).`);
          continue;
        } catch (inner) {
          const innerCode =
            inner && typeof inner === "object" && "code" in inner
              ? String((inner as { code?: string }).code)
              : "";
          if (innerCode === "42701" || innerCode === "42P07" || innerCode === "23514") {
            console.log(`Skipped ${file} (${innerCode}; already applied or conflicting).`);
            continue;
          }
          throw inner;
        }
      }
      if (file === "030_ai_presenter.sql") {
        const tablesOnly = schema.split("-- Presentation assets bucket")[0] ?? schema;
        try {
          await sql.unsafe(tablesOnly);
          console.log(`Applied ${file} (schema only; skipped Supabase storage policies).`);
          continue;
        } catch (inner) {
          const innerCode =
            inner && typeof inner === "object" && "code" in inner
              ? String((inner as { code?: string }).code)
              : "";
          if (innerCode === "42701" || innerCode === "42P07" || innerCode === "23514") {
            console.log(`Skipped ${file} (${innerCode}; already applied or conflicting).`);
            continue;
          }
          throw inner;
        }
      }
      // Idempotent re-runs: skip known "already applied" / conflicting check constraints
      // from older migrations when columns already exist.
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "";
      if (code === "42701" || code === "42P07" || code === "23514") {
        console.log(`Skipped ${file} (${code}; already applied or conflicting).`);
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
