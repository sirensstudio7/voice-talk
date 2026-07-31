# LORESCALE AI Presenter — PRD Set

Product requirements for **LORESCALE AI Presenter**: a Digital Presentation Intelligence Layer that turns PPT/PDF/DOCX/TXT into an autonomous digital presenter (greeting → narrated slides → closing → audience Q&A) with avatar, TTS/STT, RAG, and operator controls.

## Documents

| File | Contents |
|------|----------|
| [PRD-1.md](./PRD-1.md) | Overview, problem/goals, MVP scope, KPIs, FR-001–012, NFR, Feature 1 (AI Presentation Engine) |
| [PRD-2.md](./PRD-2.md) | Features 2–10, user flows, system/Q&A/RAG architecture, realtime events, session state machine |
| [PRD-3.md](./PRD-3.md) | Database schema, tech stack & constraints, security, performance, testing, phase roadmap, risks |
| [PRD-4.md](./PRD-4.md) | Frontend routes/screens, Zustand stores, stage layout & avatar interaction contract |
| [ANALYSIS.md](./ANALYSIS.md) | Gap analysis vs current VoiceTalk/Lorescale monorepo |

## Product brief

**In scope (MVP):** file upload & parsing, script + voice generation, knowledge embeddings, live presentation stages, operator controls, mic Q&A with moderation, analytics.

**Out of scope (V1):** AI-generated PPT, video export, white-label, custom domain, avatar marketplace, AR/VR, offline models, holographic presenter.

## Suggested reading order

1. [PRD-1](./PRD-1.md) — why and what  
2. [PRD-2](./PRD-2.md) — how it runs  
3. [PRD-3](./PRD-3.md) — data & platform constraints  
4. [PRD-4](./PRD-4.md) — UI/stage contract  
5. [ANALYSIS](./ANALYSIS.md) — fit against this repo  

## Note on stack

These PRDs assume NestJS, MinIO, BullMQ, OpenAI, and Socket.IO. This monorepo today uses Fastify, Supabase, and Gemini Live. See [ANALYSIS.md](./ANALYSIS.md) for reconciliation and a recommended adapt-in-monorepo path.
