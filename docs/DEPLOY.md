# Production deployment

For **custom domain** (api/app/admin subdomains), see [`DEPLOY-DOMAIN.md`](DEPLOY-DOMAIN.md).

## Prerequisites

- Managed Postgres (production uses Aiven) with migrations applied —
  `bun run seed:db` runs `apps/server/scripts/migrate.ts` against
  `DATABASE_URL` from `db/migrations/`
- A Redis instance (Upstash) — rate limits + background-job locks
- An S3-compatible bucket for uploads — production uses Cloudflare R2
- [Render](https://render.com) account (API)
- [Vercel](https://vercel.com) account (customer-app + admin-app)

## 1. Database

Migrations are plain Postgres SQL in [`db/migrations`](../db/migrations),
applied with the built-in runner (idempotent, no tracking table needed):

```bash
DATABASE_URL="postgresql://...?sslmode=require" bun run seed:db
```

Copy the credentials into a secure note for Render env vars. Poolers work as-is —
the driver connects with prepared statements disabled.

## 2. Object storage (Cloudflare R2)

Create one bucket per storage area (same names the code uses):

`lorescale-photos`, `photo-branding`, `presentation-assets`,
`campaign-banners`, `lucky-spin-prizes`, `payment-qr`, `payment-proofs`,
`product-images`, `assistant-avatars`.

Then create an R2 API token and either use the bucket's public `r2.dev` URL or
attach a custom domain as the public base. Migrating existing Supabase Storage
objects (photos, avatars, payment QR, presentation assets, banners):

```bash
# in apps/server, with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for the source
# and the S3_* variables for the destination:
bun scripts/migrate-storage-to-r2.ts --dry-run   # inventory per bucket
bun scripts/migrate-storage-to-r2.ts             # copy objects
bun scripts/migrate-storage-to-r2.ts --rewrite-db # point stored URLs at R2
```

## 3. Render — Elysia API

1. Connect GitHub repo to Render
2. Use [`render.yaml`](../render.yaml) (Blueprint): the API deploys as a Docker
   service from [`apps/server/Dockerfile`](../apps/server/Dockerfile), on the
   `oven/bun` image. There is no build step — `bun src/index.ts` runs the
   TypeScript entrypoint directly. CI also publishes the image to
   `ghcr.io/<owner>/<repo>` if you prefer deploying from a registry.
   - **Health check:** `/health`

3. Set environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Aiven (or any managed Postgres) URL, `?sslmode=require` |
| `REDIS_URL` | Upstash `rediss://` URL — rate limits + background-job locks |
| `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY_ID` | R2 API token key |
| `S3_SECRET_ACCESS_KEY` | R2 API token secret |
| `S3_REGION` | `auto` |
| `S3_PUBLIC_BASE_URL` | Bucket public URL / custom domain |
| `GEMINI_API_KEY` | Google AI Studio key |
| `JWT_SECRET` | Random 32+ char string |
| `GEMINI_MODEL` | `gemini-3.1-flash-live-preview` |

4. After deploy, verify: `https://YOUR-SERVICE.onrender.com/health`

5. Run seed once (from your machine):

```bash
DATABASE_URL="your-postgres-url" bun run --filter server seed
```

> Free tier sleeps after inactivity. Voice WebSocket demos may disconnect — use a paid instance for reliable demos.

## 4. Vercel — frontends

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

## 5. Quick local demo (no Render)

```bash
bun run demo:cloudflare
```

Shares a temporary public URL via Cloudflare Tunnel while running locally.

## Checklist

- [ ] Migrations applied from `db/migrations`
- [ ] R2 buckets created and existing objects copied (`migrate-storage-to-r2.ts`)
- [ ] Render `/health` returns `{"status":"ok",...}`
- [ ] Seed data exists (Sunrise Coffee)
- [ ] Admin login works on Vercel
- [ ] Voice session connects (customer app)
