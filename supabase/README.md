# Supabase setup (production)

**New project:** follow [`docs/SUPABASE-SETUP.md`](docs/SUPABASE-SETUP.md)

**Custom domain deploy:** follow [`docs/DEPLOY-DOMAIN.md`](docs/DEPLOY-DOMAIN.md)

Quick checklist:

```bash
npm run setup:supabase   # prints steps
```

Run in Supabase SQL Editor (in order):

1. [`migrations/001_initial_schema.sql`](migrations/001_initial_schema.sql) — tables
2. [`migrations/002_storage_buckets.sql`](migrations/002_storage_buckets.sql) — Storage buckets (Supabase only)

Then copy to root `.env`:

- **Database → Connection pooler** (Transaction mode, port 6543) → `DATABASE_URL`
- **Project Settings → API → URL** → `SUPABASE_URL`
- **Project Settings → API → service_role** → `SUPABASE_SERVICE_ROLE_KEY`

# Local setup (no Supabase)

```bash
brew services start postgresql@16
createdb voicetalk   # once
npm run seed:db
```

Uploads use `apps/server/uploads/` locally when `SUPABASE_*` is unset.
