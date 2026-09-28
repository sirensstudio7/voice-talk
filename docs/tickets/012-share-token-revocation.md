# TKT-012 — Presentation share-token revocation

- **Status:** proposed
- **Priority:** P2
- **Area:** security
- **Effort:** S (≤ 1 day)
- **Depends on:** —
- **Source:** presenter feature audit, 2026-09-29

## Problem

A presentation share link is a bearer credential: long-lived, unrevocable, and
sufficient to watch, ask questions, and call session control endpoints. If it
leaks (screenshot, forwarded email, pasted in a group chat) the merchant has no
way to cut access — the only option is archiving the deck.

## Evidence

- `presentations.share_token` is a random 18-byte token stored on the row; no
  expiry, rotation or revocation column.
- Public routes under `/public/presentations/share/:token` accept it without any
  session or user binding (`routes/presentations.ts`).

## Proposal

1. Add `share_token_revoked_at TIMESTAMPTZ NULL` and/or `share_token_expires_at`
   (optional TTL when creating the link).
2. `POST …/:presentationId/share/revoke` and `…/share/rotate`; rotate issues a new
   token and revokes the old one.
3. Every public share handler rejects revoked/expired tokens with a clear 410.
4. Admin UI: show created date, expiry (if any), "Revoke" and "New link" actions
   with a confirmation dialog.
5. Audit the revoke/rotate action (existing audit log for platform; merchant
   audit if available).

## Acceptance criteria

- [ ] Revoked token: landing page and all public APIs return 410 with a friendly
      message.
- [ ] Rotated link works; the old one does not.
- [ ] Optional expiry is enforced server-side, not only in the UI.

## Out of scope

- Password-protected links / viewer identity.
- Per-viewer analytics.

## Rollout / risk

Additive column + endpoints; existing tokens keep working (no revocation set).
