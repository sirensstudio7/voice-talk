# Production deployment

For **Supabase setup**, see [`SUPABASE-SETUP.md`](SUPABASE-SETUP.md).

For **custom domain** (api/app/admin subdomains), see [`DEPLOY-DOMAIN.md`](DEPLOY-DOMAIN.md).

## Prerequisites

- Supabase project with migrations applied (see [`supabase/README.md`](../supabase/README.md))
- [Render](https://render.com) account (API)
- [Vercel](https://vercel.com) account (customer-app + admin-app)

## 1. Supabase (production database)

In Supabase SQL Editor, run:

1. `supabase/migrations/001_initial_schema.sql`

Storage buckets are no longer provisioned in SQL — uploads go to local disk
(`apps/server/uploads/`) unless `SUPABASE_*` env vars are set.

Copy credentials into a secure note for Render env vars.

## 2. Render — Elysia API

1. Connect GitHub repo to Render
2. Use [`render.yaml`](../render.yaml) (Blueprint): the API deploys as a Docker
   service from [`apps/server/Dockerfile`](../apps/server/Dockerfile), on the
   `oven/bun` image. There is no build step — `bun src/index.ts` runs the
   TypeScript entrypoint directly.
   - **Health check:** `/health`

3. Set environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase pooler URL (port 6543, Transaction mode) |
| `REDIS_URL` | Upstash `rediss://` URL — rate limits + background-job locks |
| `SUPABASE_URL` | `https://[ref].supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (secret) |
| `GEMINI_API_KEY` | Google AI Studio key |
| `JWT_SECRET` | Random 32+ char string |
| `GEMINI_MODEL` | `gemini-3.1-flash-live-preview` |

4. After deploy, verify: `https://YOUR-SERVICE.onrender.com/health`

5. Run seed once (from your machine):

```bash
DATABASE_URL="your-supabase-pooler-url" bun run --filter server seed
```

> Free tier sleeps after inactivity. Voice WebSocket demos may disconnect — use a paid instance for reliable demos.

## 3. Vercel — frontends

Deploy each app separately (or as monorepo projects):

### customer-app

- Root: `apps/customer-app`
- Env:
  - `NEXT_PUBLIC_API_URL=https://YOUR-SERVICE.onrender.com`
  - `NEXT_PUBLIC_WS_URL=wss://YOUR-SERVICE.onrender.com/ws/session`

### admin-app

- Root: `apps/admin-app`
- Env:
  - `NEXT_PUBLIC_API_URL=https://YOUR-SERVICE.onrender.com`

Redeploy after setting env vars.

## 4. Quick local demo (no Render)

```bash
bun run demo:cloudflare
```

Shares a temporary public URL via Cloudflare Tunnel while running locally.

## Checklist

- [ ] Supabase migrations applied
- [ ] Render `/health` returns `{"status":"ok",...}`
- [ ] Seed data exists (Sunrise Coffee)
- [ ] Admin login works on Vercel
- [ ] Voice session connects (customer app)
