import { SQL } from "bun";

/**
 * Copies existing Supabase Storage objects into the S3-compatible bucket set
 * (Cloudflare R2 in production) and optionally rewrites stored URLs.
 *
 *   bun scripts/migrate-storage-to-r2.ts --dry-run      # inventory only
 *   bun scripts/migrate-storage-to-r2.ts                # copy objects
 *   bun scripts/migrate-storage-to-r2.ts --rewrite-db   # copy + rewrite URLs
 *
 * Source env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (service role, not anon).
 * Destination env: S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
 * S3_REGION (default auto) and S3_PUBLIC_BASE_URL. DATABASE_URL is only needed
 * for --rewrite-db. Re-runs are safe: objects are overwritten in place.
 */
const BUCKETS = [
  "lorescale-photos",
  "photo-branding",
  "presentation-assets",
  "campaign-banners",
  "lucky-spin-prizes",
  "payment-qr",
  "payment-proofs",
  "product-images",
  "assistant-avatars",
];

const flags = new Set(process.argv.slice(2));
const dryRun = flags.has("--dry-run");
const rewriteDb = flags.has("--rewrite-db");

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
  return value;
}

const supabaseUrl = required("SUPABASE_URL").replace(/\/+$/, "");
const supabaseKey = required("SUPABASE_SERVICE_ROLE_KEY");
const s3Endpoint = required("S3_ENDPOINT");
const s3Bucket = required("S3_BUCKET");
const s3AccessKeyId = required("S3_ACCESS_KEY_ID");
const s3SecretAccessKey = required("S3_SECRET_ACCESS_KEY");
const s3Region = process.env.S3_REGION?.trim() || "auto";
const s3PublicBaseUrl = required("S3_PUBLIC_BASE_URL").replace(/\/+$/, "");

const s3 = new Bun.S3Client({
  endpoint: s3Endpoint,
  accessKeyId: s3AccessKeyId,
  secretAccessKey: s3SecretAccessKey,
  region: s3Region,
});

const authHeaders: Record<string, string> = {
  apikey: supabaseKey,
  authorization: `Bearer ${supabaseKey}`,
};

async function listObjects(bucket: string, prefix: string): Promise<string[]> {
  const limit = 1000;
  const paths: string[] = [];
  for (let offset = 0; ; offset += limit) {
    const response = await fetch(`${supabaseUrl}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ prefix, limit, offset }),
    });
    if (!response.ok) {
      throw new Error(`list ${bucket}/${prefix}: ${response.status} ${await response.text()}`);
    }
    const entries = (await response.json()) as Array<{ name: string; id: string | null }>;
    for (const entry of entries) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        paths.push(...(await listObjects(bucket, full)));
      } else {
        paths.push(full);
      }
    }
    if (entries.length < limit) return paths;
  }
}

async function copyBucket(bucket: string): Promise<{ objects: number; bytes: number }> {
  const paths = await listObjects(bucket, "");
  let bytes = 0;
  for (const path of paths) {
    const response = await fetch(
      `${supabaseUrl}/storage/v1/object/${bucket}/${encodeURI(path)}`,
      { headers: authHeaders },
    );
    if (!response.ok) {
      throw new Error(`download ${bucket}/${path}: ${response.status} ${await response.text()}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    bytes += buffer.byteLength;
    if (!dryRun) {
      // Single physical bucket: the Supabase bucket name becomes the prefix,
      // matching src/storage/index.ts.
      await s3.write(`${bucket}/${path}`, buffer, {
        bucket: s3Bucket,
        type: response.headers.get("content-type") ?? "application/octet-stream",
      });
    }
  }
  return { objects: paths.length, bytes };
}

async function rewriteStoredUrls(): Promise<void> {
  const databaseUrl = required("DATABASE_URL");
  const sql = new SQL({ url: databaseUrl, max: 1 });
  const oldBase = `${supabaseUrl}/storage/v1/object/public`;
  const pattern = `%${oldBase}%`;

  const columns = (await sql`
    select table_schema, table_name, column_name
    from information_schema.columns
    where table_schema = 'public' and data_type in ('text', 'character varying')
    order by table_name, column_name
  `) as Array<{ table_schema: string; table_name: string; column_name: string }>;

  let touchedColumns = 0;
  for (const column of columns) {
    const target = `"${column.table_schema}"."${column.table_name}"."${column.column_name}"`;
    const [{ count }] = (await sql.unsafe(
      `select count(*)::int as count from "${column.table_schema}"."${column.table_name}" where ${target} like $1`,
      [pattern],
    )) as Array<{ count: number }>;
    if (count === 0) continue;
    await sql.unsafe(
      `update "${column.table_schema}"."${column.table_name}" set ${target} = replace(${target}, $1, $2) where ${target} like $3`,
      [oldBase, s3PublicBaseUrl, pattern],
    );
    touchedColumns += 1;
    console.log(
      `  rewrote ${count} value(s) in ${column.table_name}.${column.column_name}`,
    );
  }

  await sql.close();
  console.log(
    touchedColumns === 0
      ? "No stored Supabase URLs found."
      : `Rewrote URLs in ${touchedColumns} column(s).`,
  );
}

async function main() {
  console.log(
    `${dryRun ? "[dry-run] " : ""}Copying Supabase Storage -> ${s3Endpoint} (${s3PublicBaseUrl})`,
  );
  let totalObjects = 0;
  let totalBytes = 0;
  for (const bucket of BUCKETS) {
    const { objects, bytes } = await copyBucket(bucket);
    totalObjects += objects;
    totalBytes += bytes;
    console.log(
      `  ${bucket}: ${objects} object(s), ${(bytes / 1024 / 1024).toFixed(1)} MB${dryRun ? "" : " copied"}`,
    );
  }
  console.log(
    `Done: ${totalObjects} object(s), ${(totalBytes / 1024 / 1024).toFixed(1)} MB${dryRun ? " (dry run)" : ""}.`,
  );

  if (rewriteDb && !dryRun) {
    await rewriteStoredUrls();
  } else if (rewriteDb) {
    console.log("Skipping --rewrite-db in dry-run mode.");
  }
}

await main();
