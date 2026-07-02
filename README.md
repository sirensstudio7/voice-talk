# EVA Voice MVP

Phase 1 voice vertical slice for the AI Cashier demo.

## Stack

- `apps/api` — FastAPI + Gemini Live API + order tools
- `apps/customer-app` — Next.js customer voice UI

## Setup

### 1. Environment

Copy `.env.example` to `.env` and set `GEMINI_API_KEY`.

Get a free key from [Google AI Studio](https://aistudio.google.com/apikey).

### 2. API

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 3. Customer app

```bash
cd apps/customer-app
npm install
npm run dev
```

Open [http://localhost:6670](http://localhost:6670).

> Note: Next.js blocks port 6666 (reserved for IRC). Use **6670** instead.

## Try it

1. Click **Start**
2. Hold **mic** and say: "I'd like a latte and a croissant"
3. Watch the transcript and live order update

## API endpoints

- `GET /health`
- `GET /menu`
- `WS /ws/session`

## Notes

- Seed business: Sunrise Coffee
- Voice provider: Gemini Live (free tier)
- Push-to-talk for MVP simplicity

## Deploy for demo

Repo: [github.com/sirensstudio7/voice-talk](https://github.com/sirensstudio7/voice-talk)

### 1. API on Render

1. Connect the GitHub repo on [Render](https://render.com)
2. Use **Blueprint** with `render.yaml`, or create a Web Service manually:
   - Root Directory: `apps/api`
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Set `GEMINI_API_KEY` in Render environment variables
4. Test: `https://YOUR-API.onrender.com/health`

### 2. Frontend on Vercel

1. Import the repo on [Vercel](https://vercel.com)
2. Set **Root Directory** to `apps/customer-app`
3. Add environment variables (replace with your Render URL):

```
NEXT_PUBLIC_API_URL=https://YOUR-API.onrender.com
NEXT_PUBLIC_WS_URL=wss://YOUR-API.onrender.com/ws/session
```

4. Deploy and open the Vercel URL in Chrome or Safari (mic required)

### Demo tip

Render free tier sleeps when idle. Hit `/health` ~1 minute before your demo to wake the API.
