# Feature inventory

Canonical map of what the product does today, where it lives, and which
technical constraints apply. Update this file when a feature ships or is
retired.

Legend: **live** = used in production flows · **partial** = implemented with
known gaps · **dormant** = code exists, not reachable/used.

## Product shape

Multi-tenant SaaS for physical businesses. A merchant's workspace runs a
browser kiosk (tablet/mini-PC on the shop floor) that talks to visitors with a
Gemini Live voice assistant, plus optional add-ons (photo, spin, banners,
booking) and two larger paid modules: AI Presenter and LORESCALE LIVE. Billing
is manual (bank transfer + proof, approved in the super-admin app); there is no
payment gateway, email or WhatsApp delivery.

## 1. Voice assistant core — `apps/server/src/routes/websocket.ts`

| Feature | Status | Notes |
|---|---|---|
| Voice session (`/ws/session`) | live | OrderStore per socket; Gemini Live audio in/out; transcript merging; restore-on-reconnect |
| Voice ordering (menu, cart, checkout, payment QR) | live | Tools mutate the in-memory store; `confirm_order` persists `orders`/`order_items`; payment is a static QR — no paid state server-side |
| FAQ / knowledge base + idle timeout | live | Knowledge entries feed the system prompt; `end_conversation` tool + heuristics; idle timeout per `ai_rules` |
| Hold-to-talk, typed input, continuous listen (VAD) | live | `audio.activity_*`, `input.text` |
| Language (EN/ID base + Language Pack add-on) | live | Prompt builders are language-keyed; ID prompts must not contain "singkat" (Gemini quirk, guarded in `config-builder.ts`) |
| Voice minutes wallet | live | Account-level grants + append-only ledger; 15 s minimum debit; 5-min orphan sweep; **debit is not transactional** |
| Kiosk voice session state (`/ws/kiosk`) | live | Session active/released/cooldown, vision hub per instance |

## 2. Kiosk & vision

| Feature | Status | Notes |
|---|---|---|
| Kiosk displays + PIN unlock | live | DB-backed leases, Redis rate limit, `kiosk_displays` |
| Browser vision (MediaPipe / Human.js) | live | Camera in the kiosk browser; presence → enter/exit/confirmed, hand-raise trigger |
| Greeting flow / kiosk phase FSM | live | `idle → waiting → greeting → listening → talking → goodbye`; 12 s greeting release, cooldown, person-lost goodbye |
| Vision settings + metrics | live | Source `auto/browser/human` (Python retired); **metrics query loads all events for a business and filters in JS** |
| Kiosk config push (banners, spin, booking, vision) | live | Cross-instance via `kiosk:broadcast` Redis fanout |

## 3. Paid add-ons

| Add-on | Status | Notes |
|---|---|---|
| Smart Photo Moment | live | Consent → capture → branded JPEG + QR download; hourly/daily retention jobs; frame/logo fetched from storage per capture (no cache) |
| Lucky Spin | live | Campaigns/prizes/stock/vouchers; spin is transactional (`SELECT … FOR UPDATE`); daily limit is UTC; public spin unthrottled |
| Campaign Banner | live | Up to 5 banners, layouts top/right/bottom, impressions/clicks; **analytics scans all events, unbounded** |
| Booking | live | Staff/services/hours, 15-min slots in Asia/Jakarta, voice tools; **availability→insert has no transaction (double-booking possible)** |
| Language Pack | live | Gates 10 extra languages in prompt + presenter |
| AI Presenter | partial | See §4 |
| LORESCALE LIVE | partial | See §5 |

## 4. AI Presenter — `presentations*.ts`, `presenter-live.ts`

| Capability | Status | Notes |
|---|---|---|
| Deck CRUD, upload PPTX (50 MB), thumbnails | live | `pptx-glimpse` renders slide 1; text+notes parsed from OOXML via JSZip |
| Prepare pipeline (parse → script → index) | live | **In-process fire-and-forget**, no queue; a restart mid-run leaves `processing` until re-queued |
| Script generation via Gemini | dormant | Heuristic talking points + static greeting/closing are used instead |
| Pre-rendered WAV narration | dormant | Voice streams live from Gemini per viewer instead |
| Deck knowledge notes + RAG | partial | Keyword scoring with priority weights; `presentation_embeddings` rows exist but embeddings are unused (no vectors) |
| Live session state machine + operator API | live | `initializing → greeting → presenting ⇄ paused → closing → qna_waiting → thinking → answering → completed`; pause/next/previous are API-only (no UI) |
| Viewer voice (`/ws/presentation-session`) | live | **One Gemini Live session per viewer socket**; PCM to the browser; no fan-out |
| Audience Q&A + moderation | partial | Gemini text answers with source excerpts; static regex moderation; no audit trail |
| Share links | partial | Long-lived token, no expiry/revoke; shared viewers can submit questions and call control endpoints |
| Audience count / analytics export / dashboard | dormant / partial | `audience-count` endpoint unused; per-session JSON only |

## 5. LORESCALE LIVE — `live*.ts`

| Capability | Status | Notes |
|---|---|---|
| Rooms, live-only catalog, session products, knowledge | live | `products.live_only` hidden from the normal menu |
| Chat + viewer count + product highlight (`/ws/live/:sessionId`) | live | **Room registry, viewer count, host loop, TTS cache are instance memory only** |
| AI host voice | live | One Gemini Live connection per room; fallback batch TTS with in-memory WAV cache; last resort browser speech |
| Public watch + checkout | live | `/{slug}/live/{sessionId}`; orders tagged `live_session_id` |

## 6. Merchant admin (`apps/admin-app`)

Workspaces, onboarding, plan/trial billing, voice minutes + top-up, transactions,
menu/products, knowledge, AI rules (voice presets, tone, language, timeouts,
prompt preview), conversations (transcripts, exports, force-end), orders,
schedule, booking management, appearance (background, orientation, kiosk UI),
kiosks (PINs, release), analytics, feature gates, and add-on consoles
(photo/spin/banner/language/booking/presenter/live). Payments pages are manual
transfer + proof upload.

## 7. Platform admin (`apps/super-admin-app`)

Signup approval, user/business management, impersonation, plan/subscription
requests, add-on requests, minute top-ups, pricing (plans/add-ons/top-ups),
dashboard metrics (MRR, minutes), audit logs, demo requests, per-user API keys,
vision inventory. `kiosk-rules` and `avatar-pose` editors persist to
localStorage only. The `add-ons` page is a "coming soon" placeholder.

## 8. Marketing (`apps/marketing-app`)

Landing with an embedded live kiosk demo (`?embed=hero`), feature sections,
request-demo form → platform leads, photo download page. Pricing section exists
in code but is not mounted. Privacy/Terms/Contact links are placeholders.

## Cross-cutting architecture

- **Realtime channels**: `/ws/session` (voice), `/ws/kiosk` (vision + config),
  `/ws/presentation-session`, `/ws/live/:id`. All sockets are pinned to the
  instance that accepted them; kiosk settings fan out over Redis
  (`kiosk:broadcast`). See `MULTI-INSTANCE.md`.
- **External services**: Gemini Live (voice), Gemini text (Q&A/live replies),
  Gemini TTS fallback, S3-compatible storage (one R2 bucket, prefixes per area),
  Postgres, Redis (rate limits, job locks, config fanout). No email/WhatsApp.
- **Money paths**: subscriptions per account, add-ons per workspace, voice
  minutes per account, top-ups; all entitlements resolved lazily on read.
- **Per-instance caches** (invalidated locally, except menu which is invalidated
  by the kiosk bus on every instance): user/access caches (60 s), USD–IDR FX
  (15 min), `/menu` (45 s, bus-invalidated), photo branding (10 min, keyed by
  settings version), live TTS cache.
- **Jobs**: photo QR expiry (hourly), photo retention (daily), minute orphan
  sweep (5 min), analytics/vision retention (daily), presenter stuck-deck sweep
  (10 min) — all interval-locked across instances.

## Known gaps (technical)

> Each gap below has a proposal ticket in [`docs/tickets/`](tickets/README.md).
> That directory is the working backlog; this table is the summary.

| Area | Gap | Ticket (state on `feat/multi-instance-hardening`) |
|---|---|---|
| Voice minutes | Debit loops lot updates without a transaction — concurrent sessions can overspend | TKT-001 in-progress |
| Booking | Availability check + insert is not atomic — double bookings possible | TKT-002 in-progress |
| `/menu` | 8 service calls per request, no cache; observed 1.6–2.3 s in production | TKT-005 in-progress |
| Analytics | Banner/vision metrics load unbounded rows and aggregate in JS; no retention on `analytics_events`/`vision_events` | TKT-008 in-progress |
| Presenter | No durable queue; embeddings unused; per-viewer Gemini sessions; share token cannot be revoked | TKT-007 + TKT-010 + TKT-012 in-progress |
| LIVE | Single-instance by design; in-memory room state | TKT-006 guard + ADR in-progress |
| Frontends | No CI typecheck (real errors found in super-admin); admin/super-admin ESLint config broken under ESLint 9 | TKT-011 typecheck blocking, lint non-blocking |
| Dead code | `apps-legacy`, several unused components, `getPhotoDownloadBaseUrl` | TKT-013 in-progress |
