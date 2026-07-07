# Deploy to your custom domain

Example layout (replace `yourdomain.com` with yours):

| Subdomain | Service | Hosts |
|---|---|---|
| `api.yourdomain.com` | Render | Fastify (`apps/server`) — REST + WebSocket |
| `app.yourdomain.com` | Vercel | Customer voice UI (`apps/customer-app`) |
| `admin.yourdomain.com` | Vercel | Admin dashboard (`apps/admin-app`) |
| `yourdomain.com` | Vercel (optional) | Marketing site (`apps/marketing-app`) |

```mermaid
flowchart LR
  User[Browser]
  App[app.yourdomain.com]
  Admin[admin.yourdomain.com]
  API[api.yourdomain.com]
  SB[(Supabase)]

  User --> App
  User --> Admin
  App -->|HTTPS + WSS| API
  Admin -->|HTTPS| API
  API --> SB
```

---

## Prerequisites

- [Supabase project configured](SUPABASE-SETUP.md)
- Domain DNS managed (Cloudflare, Namecheap, etc.)
- GitHub repo pushed

---

## Step 1 — Deploy API on Render

1. [render.com](https://render.com) → **New → Blueprint** (or Web Service)
2. Connect repo, use [`render.yaml`](../render.yaml)
3. Set **Environment** variables:

```env
DATABASE_URL=postgresql://postgres.[ref]:[pass]@...pooler.supabase.com:6543/postgres
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
GEMINI_API_KEY=...
JWT_SECRET=<long-random-string>
GEMINI_MODEL=gemini-3.1-flash-live-preview
ALLOWED_ORIGINS=https://app.yourdomain.com,https://admin.yourdomain.com,yourdomain.com
```

Domain-only entries (e.g. `yourdomain.com`) allow any `https://` subdomain. Host-only entries (e.g. `app.yourdomain.com`) match that host exactly.

4. Deploy → note Render URL: `https://voice-talk-api.onrender.com`
5. Test: `https://voice-talk-api.onrender.com/health`
6. Seed (once): `DATABASE_URL="..." npm run seed --workspace=server`

### Custom domain on Render

1. Render service → **Settings → Custom Domains**
2. Add `api.yourdomain.com`
3. At your DNS provider, add the CNAME Render shows, e.g.:

```
api  CNAME  voice-talk-api.onrender.com
```

4. Wait for SSL (automatic). Test: `https://api.yourdomain.com/health`

---

## Step 2 — Deploy customer app on Vercel

1. [vercel.com](https://vercel.com) → Import repo
2. **Root Directory:** `apps/customer-app`
3. **Environment variables:**

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com/ws/session
```

4. Deploy
5. **Settings → Domains** → add `app.yourdomain.com`
6. Add DNS CNAME Vercel provides:

```
app  CNAME  cname.vercel-dns.com
```

---

## Step 3 — Deploy admin app on Vercel

1. New Vercel project, **Root Directory:** `apps/admin-app`
2. **Environment variables:**

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_CUSTOMER_APP_URL=https://app.yourdomain.com
```

3. **Domains** → `admin.yourdomain.com`

---

## Step 4 — (Optional) Marketing site

1. Vercel project, **Root Directory:** `apps/marketing-app`
2. Env:

```env
NEXT_PUBLIC_CUSTOMER_APP_URL=https://app.yourdomain.com
NEXT_PUBLIC_ADMIN_APP_URL=https://admin.yourdomain.com
```

3. Domain: `yourdomain.com` or `www.yourdomain.com`

---

## Step 5 — Smoke test

| Check | URL |
|---|---|
| API health | `https://api.yourdomain.com/health` |
| Menu | `https://api.yourdomain.com/menu?business=sunrise-coffee` |
| Customer voice | `https://app.yourdomain.com/b/sunrise-coffee` |
| Admin login | `https://admin.yourdomain.com` |

Voice WebSocket must use `wss://` (not `ws://`) on HTTPS sites.

---

## Render free tier note

Free Render services **sleep** after ~15 min idle. First request is slow; voice WebSockets may drop. For production demos on a custom domain, use a **Starter** plan or another host (Fly.io, Railway).

---

## Quick reference — your `.env` for local dev pointing at Supabase

```env
DATABASE_URL=postgresql://...pooler.supabase.com:6543/postgres
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
GEMINI_API_KEY=...
JWT_SECRET=...
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/session
```

Production frontends use `https://api.yourdomain.com` instead of localhost.
