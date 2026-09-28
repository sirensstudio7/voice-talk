# Production deployment

For **custom domain** (api/app/admin subdomains), see [`DEPLOY-DOMAIN.md`](DEPLOY-DOMAIN.md).

## Prerequisites

- Managed Postgres (production uses Aiven) with migrations applied —
  `bun run seed:db` runs `apps/server/scripts/migrate.ts` against
  `DATABASE_URL` from `db/migrations/`
- A Redis instance (Upstash) — rate limits + background-job locks
- An S3-compatible bucket for uploads — production uses Cloudflare R2
- A container host for the API image (VM with Docker, Fly.io, Railway, Cloud Run, Kubernetes…)
- [Vercel](https://vercel.com) account (customer-app + admin-app)

## 1. Database

Migrations are plain Postgres SQL in [`db/migrations`](../db/migrations),
applied with the built-in runner (idempotent, no tracking table needed):

```bash
DATABASE_URL="postgresql://...?sslmode=require" bun run seed:db
```

Copy the credentials into a secure note for your host's env vars. Poolers work as-is —
the driver connects with prepared statements disabled.

## 2. Object storage (Cloudflare R2)

Create **one** bucket (e.g. `lorescale`) and attach a public custom domain (or
use the bucket's `r2.dev` URL). Uploads are stored under a prefix per area —
`lorescale-photos/`, `photo-branding/`, `presentation-assets/`,
`campaign-banners/`, `lucky-spin-prizes/`, `payment-qr/`, `payment-proofs/`,
`product-images/`, `assistant-avatars/` — so a single public domain serves
everything:

```env
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_BUCKET=lorescale
S3_PUBLIC_BASE_URL=https://media.yourdomain.com
```

Migrating existing Supabase Storage objects (photos, avatars, payment QR,
presentation assets, banners):

```bash
# in apps/server, with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for the source
# and the S3_* variables for the destination:
bun scripts/migrate-storage-to-r2.ts --dry-run   # inventory per bucket
bun scripts/migrate-storage-to-r2.ts             # copy objects
bun scripts/migrate-storage-to-r2.ts --rewrite-db # point stored URLs at R2
```

## 3. API container (any host)

The API is a plain Docker image, so any OCI-capable host works — a VM with
Docker, Fly.io, Railway, Google Cloud Run, Kubernetes, Coolify, Nomad… CI
publishes every main build to `ghcr.io/<owner>/<repo>` (`latest`, branch,
short-sha and semver tags), or build locally with
`docker build -f apps/server/Dockerfile .`.

```bash
# From GHCR (default) or your own registry:
docker run -d --name voice-talk-api \
  --env-file apps/server/.env.production.local \
  -p 8000:8000 -e PORT=8000 \
  ghcr.io/sirensstudio7/voice-talk:latest
```

Or with [`docker-compose.prod.yml`](../docker-compose.prod.yml):

```bash
docker compose -f docker-compose.prod.yml up -d
```

- **Health check:** `GET /health` (`?db=1` also pings Postgres + Redis)
- **Port:** the app listens on `PORT`, falling back to `API_PORT` (8000).
  Most platforms inject `PORT` and route to it — don't set it there.
- **TLS/domain:** terminate at your platform router or a reverse proxy
  (Caddy, nginx, Traefik) in front of the container.

Set these variables on the host (or in the env file):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Aiven (or any managed Postgres) URL, `?sslmode=require` |
| `REDIS_URL` | Upstash `rediss://` URL — rate limits + background-job locks |
| `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `S3_BUCKET` | Bucket name (prefixes separate the storage areas) |
| `S3_ACCESS_KEY_ID` | R2 API token key |
| `S3_SECRET_ACCESS_KEY` | R2 API token secret |
| `S3_REGION` | `auto` |
| `S3_PUBLIC_BASE_URL` | Bucket public URL / custom domain |
| `PUBLIC_API_URL` | Public API origin phones can reach (QR links) — required |
| `GEMINI_API_KEY` | Google AI Studio key |
| `JWT_SECRET` | Random 32+ char string |
| `GEMINI_MODEL` | `gemini-3.1-flash-live-preview` |

After deploy, verify: `https://YOUR-API-HOST/health`

Run seed once (from your machine):

```bash
DATABASE_URL="your-postgres-url" bun run --filter server seed
```

> Free tiers that sleep make voice WebSockets drop — use an always-on
> instance for demos.

## 4. Frontends (Next.js, any host)

Deploy each app separately (Vercel, Netlify, Node, Docker…):

### customer-app

- Root: `apps/customer-app`
- Env:
  - `NEXT_PUBLIC_API_URL=https://YOUR-API-HOST`
  - `NEXT_PUBLIC_WS_URL=wss://YOUR-API-HOST/ws/session`

### admin-app

- Root: `apps/admin-app`
- Env:
  - `NEXT_PUBLIC_API_URL=https://YOUR-API-HOST`

Redeploy after setting env vars.

## 5. Quick local demo (no cloud host)

```bash
bun run demo:cloudflare
```

Shares a temporary public URL via Cloudflare Tunnel while running locally
(it also sets `PUBLIC_API_URL`, so QR links work during the demo).

## Checklist

- [ ] Migrations applied from `db/migrations`
- [ ] Object storage bucket created (`lorescale`) and, if migrating, objects copied (`migrate-storage-to-r2.ts`)
- [ ] API `/health` returns `{"status":"ok",...}`
- [ ] Seed data exists (Sunrise Coffee) — only if you ran the seed
- [ ] Admin login works on Vercel
- [ ] Voice session connects (customer app)
