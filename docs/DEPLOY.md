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
- **Deploy marker:** published images carry the build commit as `GIT_SHA`;
  every log line shows it as `version`, so an incident can be tied to a deploy.
  Only set `GIT_SHA` by hand when you build the image yourself.
- **Port:** the app listens on `PORT`, falling back to `API_PORT` (8000).
  Most platforms inject `PORT` and route to it — don't set it there.
- **TLS/domain:** terminate at your platform router or a reverse proxy
  (Caddy, nginx, Traefik) in front of the container.

Set these variables on the host (or in the env file):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Aiven (or any managed Postgres) URL, `?sslmode=require` |
| `DB_POOL_MAX` | Pooled Postgres connections per API instance (default 8). Keep `instances × DB_POOL_MAX` under the service's connection limit; Aiven's free tier allows only 20 total. Set 5 for one instance on free tier. |
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
| `ANALYTICS_RETENTION_DAYS` | Optional, default 180 — analytics event history kept |
| `VISION_RETENTION_DAYS` | Optional, default 365 — vision event history kept |
| `PRESENTER_MAX_VIEWERS_PER_SESSION` | Optional, default 20 — narration sockets per AI Present session |

After deploy, verify the API and every feature path:

```bash
bun run verify:deploy -- --url https://YOUR-API-HOST --business YOUR-SLUG
```

The script is read-only (no voice session is started) and checks health,
metrics, and the `/menu` kiosk contract; it exits non-zero on a failed check.

Run seed once (from your machine):

```bash
DATABASE_URL="your-postgres-url" bun run --filter server seed
```

> Free tiers that sleep make voice WebSockets drop — use an always-on
> instance for demos.

Running more than one API instance (replicas) has extra requirements around
WebSocket fanout, draining and the DB connection budget — see
[`MULTI-INSTANCE.md`](MULTI-INSTANCE.md).

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

## Troubleshooting: database connection limits

A managed Postgres plan caps how many connections the whole service can hold
at once — Aiven's free tier allows 20. API instances each keep a pool of
`DB_POOL_MAX` connections, and a login or health check adds one more while it
runs. If the limit is reached, new connections fail with:

```
remaining connection slots are reserved for roles with the SUPERUSER attribute
```

That error can surface as `500 Internal error` on login and is not a password
problem. On a 20-connection service, set `DB_POOL_MAX=5` and run a single API
instance unless a pooler is configured. To see who holds connections, run this
against the database:

```sql
SELECT application_name, state, count(*)
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY 1, 2
ORDER BY 3 DESC;
```

API pools report `voice-talk-api`; logins and health checks report
`voice-talk-api-login` and `voice-talk-api-health`. Anything else (a local dev
server, script, or admin tool) is an external client and should not point at
the production database.

Enabling connection pooling (PgBouncer) on the service removes the hard
per-client ceiling: many clients share a few server connections. It requires
using the service's pooled port in `DATABASE_URL` instead of the direct port;
keep migrations on the direct port.

## Checklist

- [ ] Migrations applied from `db/migrations`
- [ ] Object storage bucket created (`lorescale`) and, if migrating, objects copied (`migrate-storage-to-r2.ts`)
- [ ] API `/health` returns `{"status":"ok",...}`
- [ ] `DB_POOL_MAX` accounts for the plan's connection limit and the number of API instances
- [ ] Seed data exists (Sunrise Coffee) — only if you ran the seed
- [ ] Admin login works on Vercel
- [ ] Voice session connects (customer app)
