# Migrating an existing Supabase project

One-off runbook for moving Postgres data and Storage objects from Supabase to
Aiven Postgres + Cloudflare R2 (or any managed Postgres / S3-compatible
storage). Keep the dump files outside git (`backups/` is ignored).

## 1. Postgres data

Use the **session pooler** (port 5432) or direct host — `pg_dump` does not
work through the transaction pooler (port 6543).

```bash
export SUPABASE_DB_URL="postgresql://postgres.<project-ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres?sslmode=require"
export DATABASE_URL="postgresql://avnadmin:<password>@<host>:<port>/defaultdb?sslmode=require"

# Full archival dump (all schemas, so auth/storage metadata is preserved too)
pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges -f backups/supabase-full.sql

# Restorable dump: public schema only, plus any legacy tables the current
# migrations do not create (list from your own diff — nothing here should be
# silently dropped from the archive; the full dump above is the archive).
pg_dump "$SUPABASE_DB_URL" --data-only --schema=public --no-owner --no-privileges \
  --exclude-table='public.legacy_table_*' -f backups/supabase-data.sql

# Safety copy of the target before truncating anything
pg_dump "$DATABASE_URL" --no-owner --no-privileges -f backups/target-pre-restore.sql

# Truncate every public table, then restore. pg_dump emits table data in
# dependency order, so foreign keys hold as long as all tables exist in both
# schemas (verify column parity first — see below).
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "TRUNCATE $(psql "$DATABASE_URL" -Atc "select string_agg(format('%I.%I', table_schema, table_name), ', ') from information_schema.tables where table_schema='public' and table_type='BASE TABLE'") RESTART IDENTITY CASCADE;"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backups/supabase-data.sql
```

Check column parity before restoring (`pg_dump` fails on columns that no
longer exist, and silently defaults columns that were added):

```bash
# every text/varchar column on both sides, then diff the two lists
psql "$SUPABASE_DB_URL" -Atc "select table_name||'.'||column_name from information_schema.columns where table_schema='public' order by 1" > /tmp/source-cols
psql "$DATABASE_URL"     -Atc "select table_name||'.'||column_name from information_schema.columns where table_schema='public' order by 1" > /tmp/target-cols
diff /tmp/source-cols /tmp/target-cols
```

Row counts should match per table after the restore:

```bash
psql "$DATABASE_URL" -Atc "select relname, n_live_tup from pg_stat_user_tables order by 1"
```

## 2. Storage objects

The script enumerates **every** bucket in the source project, copies objects
into the single S3/R2 bucket under a per-area prefix, and rewrites stored
`.../storage/v1/object/public/...` URLs in the database:

```bash
cd apps/server
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service_role key or sb_secret_...>"

bun scripts/migrate-storage-to-r2.ts --dry-run      # inventory per bucket
bun scripts/migrate-storage-to-r2.ts                # copy objects
bun scripts/migrate-storage-to-r2.ts --rewrite-only # rewrite URLs (no re-copy)
```

Private buckets are copied with authenticated reads; the R2 side serves them
under the same public base URL the app uses (`S3_PUBLIC_BASE_URL`).

Verify with the object inventory and by fetching a few URLs, then confirm the
database has no `supabase.co` references left:

```sql
select count(*) from businesses where background_url like '%supabase.co%';
-- repeat for ai_rules.avatar_url, products.image_url, presentations.thumbnail_url,
-- presentation_*.storage_path, photo_settings.frame_url/logo_url, *_payment_proof_url ...
```

## 3. Decommission Supabase

Only after the verification steps above pass:

1. Keep `backups/supabase-full.sql` as the archival record.
2. Delete the Supabase project (Dashboard → Project Settings → General) —
   this invalidates every publishable/secret/service-role key at once.
3. Rotate any credentials that were shared outside a password manager
   (database password, API keys) even if you pause instead of delete.

## Notes

- The old `auth`/`storage` schemas are not restored; the app owns its own
  auth (`users`, `platform_admins`) and object storage.
- If the source project used Supabase Auth for end users, their passwords
  live in `auth.users` (bcrypt) and must be re-created in the app's `users`
  table — this app does not read Supabase Auth.
- `pg_dump` must come from a client at least as new as the source server
  (e.g. client 18 dumping server 17 works; not the reverse).
