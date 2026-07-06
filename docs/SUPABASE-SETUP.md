# Supabase setup (new project)

Follow these steps once. Takes about 15 minutes.

## 1. Create project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. Pick a name (e.g. `voicetalk`), region close to your users, set a **database password** (save it)
3. Wait until the project is ready (~2 min)

## 2. Run SQL migrations

Open **SQL Editor** → **New query**.

> **Important:** Paste the **SQL code** from the file — not the file path.
> Wrong: `supabase/migrations/001_initial_schema.sql`
> Right: open the file in your editor, Select All (Cmd+A), Copy, Paste into Supabase, Run

### Easiest: one combined file

1. Open [`supabase/setup-all.sql`](../supabase/setup-all.sql) in Cursor
2. **Select all** (Cmd+A) → **Copy** (Cmd+C)
3. Paste into Supabase SQL Editor → click **Run**

You should see “Success. No rows returned.”

### Or run separately (same result)

**Query 1 — tables:** copy all of [`001_initial_schema.sql`](../supabase/migrations/001_initial_schema.sql) → Run

**Query 2 — storage:** copy all of [`002_storage_buckets.sql`](../supabase/migrations/002_storage_buckets.sql) → Run

## 3. Copy credentials to `.env`

### Database URL (for Fastify on Render)

**Project Settings → Database → Connection string → URI**

Use the **Connection pooling** tab:
- Mode: **Transaction**
- Port: **6543**

It looks like:

```
postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
```

Put this in `.env` as `DATABASE_URL`.

### API keys (for file uploads)

**Project Settings → API**

| `.env` variable | Supabase field |
|---|---|
| `SUPABASE_URL` | Project URL (`https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key (click Reveal) |

Never put `service_role` in frontend code or Vercel — server only.

## 4. Seed production data

From your repo root (with Supabase `DATABASE_URL` in `.env`):

```bash
npm run seed:db
```

Creates:
- Admin: `admin@sunrise.coffee` / `admin123`
- Demo business: `sunrise-coffee`

Change the admin password in production after first login (or set `ADMIN_PASSWORD` before seeding).

## 5. Verify connection

```bash
npm run dev:api
curl http://localhost:8000/health
curl "http://localhost:8000/menu?business=sunrise-coffee"
```

Upload a test image in admin — URL should be a `https://....supabase.co/storage/...` link.

## Troubleshooting

| Problem | Fix |
|---|---|
| `connection refused` | Use pooler URL port **6543**, not direct 5432, on serverless hosts |
| Storage upload fails | Re-run `002_storage_buckets.sql`; check `SUPABASE_SERVICE_ROLE_KEY` |
| `syntax error at or near "supabase"` | You pasted the **file path**, not the SQL. Open `supabase/setup-all.sql`, copy all text, paste in SQL Editor |
| Seed says user exists | Normal on re-run; data is idempotent for business slug |

Next: [`DEPLOY-DOMAIN.md`](DEPLOY-DOMAIN.md) to deploy Fastify + frontends on your domain.
