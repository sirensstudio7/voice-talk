import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SQL } from "bun";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/voicetalk";

/** Postgres codes meaning "this migration already ran": duplicate column /
 *  duplicate table / conflicting check constraint. Older migrations predate
 *  the IF NOT EXISTS discipline, so re-runs are tolerated rather than fatal. */
const ALREADY_APPLIED = new Set(["42701", "42P07", "23514"]);

async function migrate() {
  const sql = new SQL({ url: DATABASE_URL, max: 1 });
  const migrationsDir = resolve(process.cwd(), "../../supabase/migrations");
  const migrationFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const schema = readFileSync(resolve(migrationsDir, file), "utf8");
    try {
      await sql.unsafe(schema);
      console.log(`Applied ${file}.`);
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "";
      if (ALREADY_APPLIED.has(code)) {
        console.log(`Skipped ${file} (${code}; already applied).`);
        continue;
      }
      throw err;
    }
  }

  await sql.close();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
