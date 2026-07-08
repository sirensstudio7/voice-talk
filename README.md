# Lorescale Voice MVP

Phase 1 voice vertical slice for the AI Cashier demo.

## Stack

- `apps/server` — Fastify + Gemini Live API + Supabase Postgres + multi-tenant admin API
- `apps/customer-app` — Next.js customer voice UI (`/b/{slug}`)
- `apps/admin-app` — Next.js admin dashboard (menu, knowledge, AI rules, orders, analytics)
- `apps/marketing-app` — Next.js marketing landing page
- `supabase/` — Postgres schema migrations + Storage bucket setup

## Setup

### 1. Environment

Copy `.env.example` to `.env` and configure:

- `GEMINI_API_KEY` — from [Google AI Studio](https://aistudio.google.com/apikey)
- `DATABASE_URL` — Supabase Postgres connection pooler URL (port 6543)
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — for file uploads (optional locally; falls back to `apps/server/uploads/`)

For local Postgres without Supabase:

```bash
docker compose up -d postgres
# DATABASE_URL defaults to postgresql://postgres:postgres@localhost:5432/voicetalk
```

### 2. Database

```bash
npm install
npm run seed:db
```

This runs the schema migration and seeds Sunrise Coffee + admin user.

### 3. API server

```bash
npm run dev:api
```

Or from `apps/server`: `npm run dev`

Health check: [http://localhost:8000/health](http://localhost:8000/health)

### 4. Customer app

```bash
npm run dev
```

Open [http://localhost:6670/b/sunrise-coffee](http://localhost:6670/b/sunrise-coffee).

> Note: Next.js blocks port 6666 (reserved for IRC). Use **6670** instead.

### 5. Admin dashboard

```bash
npm run dev:admin
```

Open [http://localhost:6680](http://localhost:6680) and sign in:

- Email: `admin@sunrise.coffee`
- Password: `admin123`

Or run everything together:

```bash
npm run dev:all
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
- File uploads use Supabase Storage in production; local disk fallback for dev

## Deploy for demo

Repo: [github.com/sirensstudio7/voice-talk](https://github.com/sirensstudio7/voice-talk)

### Recommended: Cloudflare Tunnel (free, no credit card)

Share a public HTTPS link while running the app on your Mac.

**Prerequisites**

```bash
brew install cloudflared   # one-time
```

Make sure `.env` has `GEMINI_API_KEY` and `DATABASE_URL` set.

**Start the demo**

```bash
cd /Users/rio/Desktop/voicetalk
npm run demo:cloudflare
```

The script will:

1. Start the Fastify API on port 8000
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
npm run dev:api
cloudflared tunnel --url http://localhost:8000
```

3. Copy the `https://....trycloudflare.com` URL
4. In Vercel → Settings → Environment Variables:

```
NEXT_PUBLIC_API_URL=https://YOUR-TUNNEL-URL.trycloudflare.com
NEXT_PUBLIC_WS_URL=wss://YOUR-TUNNEL-URL.trycloudflare.com/ws/session
```

5. Redeploy Vercel, then keep your Mac running with the API + tunnel during the demo

### Production: Supabase + custom domain

1. **Supabase:** [`docs/SUPABASE-SETUP.md`](docs/SUPABASE-SETUP.md) — create project, run SQL, copy credentials
2. **Deploy:** [`docs/DEPLOY-DOMAIN.md`](docs/DEPLOY-DOMAIN.md) — Render (API) + Vercel (apps) + DNS

```bash
npm run setup:supabase   # checklist
npm run check:deploy     # validate env before deploy
```

Template: [`.env.production.example`](.env.production.example)
