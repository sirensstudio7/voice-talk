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
    "033_presentation_thumbnail.sql",
    "034_presentation_knowledge.sql",
    "035_lucky_spin.sql",
    "036_lucky_spin_odds_mode.sql",
    "037_lucky_spin_ai_voice.sql",
    "038_lucky_spin_winner_prize_snapshot.sql",
    "039_ai_presenter_addon.sql",
    "040_campaign_banner.sql",
    "041_campaign_banner_storage.sql",
    "042_vision_start_hotkey.sql",
    "043_ai_rules_alex_default.sql",
    "044_voice_minutes.sql",
    "045_addon_monthly_price.sql",
    "046_pricing_discounts.sql",
    "047_topup_discount.sql",
    "048_close_orphan_voice_sessions.sql",
    "049_language_pack_addon.sql",
    "050_live_addon.sql",
    "051_live_knowledge.sql",
    "052_live_only_products.sql",
    "053_live_session_orders.sql",
    "054_live_order_customer_details.sql",
    "055_kiosk_ui_mode.sql",
    "056_user_api_keys.sql",
    "057_user_api_key_source.sql",
    "058_vision_source_human.sql",
    "059_booking_addon.sql",
    "060_booking_settings.sql",
    "061_booking_staff_photo.sql",
    "062_presentation_share_token.sql",
    "063_kiosk_displays.sql",
    "064_kiosk_unlock_lease.sql",
    "065_voice_session_kiosk_display.sql",
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
      if (file === "035_lucky_spin.sql") {
        const tablesOnly = schema.split("-- Lucky spin prize bucket")[0] ?? schema;
        try {
          await sql.unsafe(tablesOnly);
          console.log(`Applied ${file} (schema only; skipped Supabase storage bucket).`);
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
      if (file === "041_campaign_banner_storage.sql") {
        console.log(`Skipped ${file} (Supabase storage policies; not needed locally).`);
        continue;
      }
      if (file === "040_campaign_banner.sql") {
        const tablesOnly = schema.split("-- Campaign banner images bucket")[0] ?? schema;
        try {
          await sql.unsafe(tablesOnly);
          console.log(`Applied ${file} (schema only; skipped Supabase storage bucket).`);
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
