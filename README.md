# Lorescale Voice MVP

Phase 1 voice vertical slice for the AI Cashier demo.

## Stack

- `apps/server` — Elysia on Bun + Gemini Live API + Postgres + multi-tenant admin API
- `apps/customer-app` — Next.js customer voice UI (`/b/{slug}`)
- `apps/admin-app` — Next.js admin dashboard (menu, knowledge, AI rules, orders, analytics)
- `apps/marketing-app` — Next.js marketing landing page
- `db/migrations` — Postgres schema migrations (plain SQL, applied by `apps/server/scripts/migrate.ts`)

## Setup

### 1. Environment

Copy `.env.example` to `apps/server/.env` and configure:

- `GEMINI_API_KEY` — from [Google AI Studio](https://aistudio.google.com/apikey)
- `DATABASE_URL` — Postgres (local or managed; production uses Aiven)
- `REDIS_URL` — rate limits + background-job locks, shared across API instances.
  Use Upstash's `rediss://...` string in production; local dev:
  `docker compose up -d redis` gives `redis://127.0.0.1:6380`
- `S3_*` — object storage (Cloudflare R2). Optional locally; uploads fall back
  to `apps/server/uploads/`. Production requires it.

For local Postgres:

```bash
docker compose up -d postgres redis
# DATABASE_URL defaults to postgresql://postgres:postgres@localhost:5432/voicetalk
# REDIS_URL defaults to redis://127.0.0.1:6380
```

### 2. Database

```bash
bun install
bun run seed:db
```

This runs the schema migration and seeds Sunrise Coffee + admin user.

### 3. API server

```bash
bun run dev:api
```

Or from `apps/server`: `bun run dev`

Health check: [http://localhost:8000/health](http://localhost:8000/health)

### 4. Customer app

```bash
bun run dev
```

Open [http://localhost:6670/b/sunrise-coffee](http://localhost:6670/b/sunrise-coffee).

> Note: Next.js blocks port 6666 (reserved for IRC). Use **6670** instead.

### 5. Admin dashboard

```bash
bun run dev:admin
```

Open [http://localhost:6680](http://localhost:6680) and sign in:

- Email: `admin@sunrise.coffee`
- Password: `admin123`

Or run everything together:

```bash
bun run dev:all
```

## Try it

1. Click **Start**
2. Hold **mic** and say: "I'd like a latte and a croissant"
3. Watch the transcript and live order update

## API endpoints

**Public (customer app)**

- `GET /health`
- `GET /menu?business={slug}`
- `GET /businesses/{slug}`
- `WS /ws/session?business={slug}`

**Admin (JWT)**

- `POST /admin/auth/login`
- `GET /admin/businesses`
- CRUD: `/admin/businesses/{id}/products`, `/knowledge`, `/ai-rules`
- `GET /admin/businesses/{id}/orders`
- Stats: `/stats/overview`, `/stats/daily`, `/stats/top-products`

## Notes

- Seed business: Sunrise Coffee
- Voice provider: Gemini Live (free tier)
- Push-to-talk for MVP simplicity
- File uploads use S3-compatible object storage (Cloudflare R2) in production; local disk for dev

## Deploy for demo

Repo: [github.com/sirensstudio7/voice-talk](https://github.com/sirensstudio7/voice-talk)

### Recommended: Cloudflare Tunnel (free, no credit card)

Share a public HTTPS link while running the app on your Mac.

**Prerequisites**

```bash
brew install cloudflared   # one-time
```

Make sure `apps/server/.env` has `GEMINI_API_KEY` and `DATABASE_URL` set.

**Start the demo**

```bash
cd /Users/rio/Desktop/voicetalk
bun run demo:cloudflare
```

The script will:

1. Start the API on port 8000
2. Open a Cloudflare tunnel for the API
3. Start the Next.js app on port 6670
4. Open a Cloudflare tunnel for the frontend
5. Print a **shareable link** like `https://xxxx.trycloudflare.com`

Keep the terminal open during the demo. Press **Ctrl+C** to stop everything.

Open the shareable link in **Chrome or Safari** and allow the microphone.

> Tunnel URLs change each time you run the script. That is normal for the free quick tunnel.

### Optional: Vercel frontend + Cloudflare API tunnel

Use this if you want a stable frontend URL on Vercel:

1. Deploy `apps/customer-app` on [Vercel](https://vercel.com) (no credit card)
2. Run API + tunnel locally:

```bash
bun run dev:api
cloudflared tunnel --url http://localhost:8000
```

3. Copy the `https://....trycloudflare.com` URL
4. In Vercel → Settings → Environment Variables:

```
NEXT_PUBLIC_API_URL=https://YOUR-TUNNEL-URL.trycloudflare.com
NEXT_PUBLIC_WS_URL=wss://YOUR-TUNNEL-URL.trycloudflare.com/ws/session
```

5. Redeploy Vercel, then keep your Mac running with the API + tunnel during the demo

### Production: managed Postgres + custom domain

1. **Database + storage:** see [`docs/DEPLOY.md`](docs/DEPLOY.md) — Aiven Postgres, Cloudflare R2 buckets, migration/copy scripts
2. **Deploy:** [`docs/DEPLOY-DOMAIN.md`](docs/DEPLOY-DOMAIN.md) — container host (API) + frontends + DNS

```bash
bun run seed:db          # apply migrations from db/migrations
bun run check:deploy     # validate env before deploy
```

### Checks and tests

```bash
bun run lint:api   # Biome over the backend (zero warnings expected)
bun run test:api   # unit tests; the smoke suite skips without services
```

From `apps/server`: `bun run typecheck`, and `bun run test:with-services` to
provision throwaway Postgres + Redis containers and run the full suite
(health, logins, validation rejections).

Voice websocket probe (checks the greeting end-to-end against any environment):

```bash
cd apps/server
bun scripts/ws-probe.ts --url wss://lorescale-api.kubeletto.app/ws/session?business=lorescale
```

It sends `session.greeting`, prints session status / first transcript / first
audio latency, and exits non-zero when the assistant stays silent.

CI runs the same lint, typecheck and tests on every push or PR that touches
the API, then builds the production Docker image and boots it against the
service containers ([`.github/workflows/api.yml`](.github/workflows/api.yml)).

Template: [`.env.production.example`](.env.production.example)
