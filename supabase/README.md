# Database schema

Plain Postgres — no Supabase-specific SQL. `migrations/` applies cleanly to any
Postgres 16 instance.

```bash
docker compose up -d          # local Postgres on :5432
npm run seed:db               # migrate + seed
```

`setup-all.sql` is the same schema flattened into one file, for pasting into a
SQL console when you cannot run the migrate script.

## Storage

Uploads go to `apps/server/uploads/` and are served from `/uploads/`. Setting
`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` switches uploads to Supabase
Storage instead — buckets must then be created in the Supabase dashboard, as
they are no longer provisioned by SQL. See [`docs/SUPABASE-SETUP.md`](../docs/SUPABASE-SETUP.md)
(legacy) for that path.

## Local setup without Docker

```bash
brew services start postgresql@16
createdb voicetalk
npm run seed:db
```
