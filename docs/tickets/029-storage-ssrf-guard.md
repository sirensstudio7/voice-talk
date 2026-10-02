# TKT-029 — SSRF allowlist for storage downloads

- **Status:** proposed
- **Priority:** P2
- **Area:** security
- **Effort:** S (≤ 1 day)
- **Depends on:** —
- **Source:** security review 2026-09-29

## Problem

`downloadFromStorage` fetches unknown `http(s)` URLs verbatim as a legacy
compatibility path. Today every caller passes server-generated storage paths
(from uploads or the `updatedAt` settings row), so there is no live exploit —
but if any URL ever becomes merchant-settable (branding, product images,
knowledge attachments), a crafted URL could make the API fetch internal
addresses (cloud metadata, localhost, private ranges).

## Evidence

- `storage/index.ts` — `downloadFromStorage`: when the URL is not under the
  configured public base/bucket marker, it does `fetch(pathOrUrl)` verbatim.
- Photo branding, presentation files and product images all pass
  server-generated values today.

## Proposal

1. Only fetch URLs under `S3_PUBLIC_BASE_URL/<bucket>/` or the legacy
   `/object/public/<bucket>/` marker; otherwise return `null` and log a
   warning (counted).
2. Never fetch when the URL resolves to a private/loopback/link-local address
   (defense in depth for the allowlist).
3. Add unit tests: external host rejected, localhost rejected, valid base and
   legacy marker accepted.

## Acceptance criteria

- [ ] Arbitrary external and internal URLs return null without a network call.
- [ ] Valid current and legacy URLs keep working (existing uploads unaffected).
- [ ] A warning counter (`storage.blocked_fetch_total`) is exposed on
      `/health?metrics=1`.

## Out of scope

- Removing the legacy URL path (needs a migration of stored values);
  authenticated proxying of storage objects.

## Rollout / risk

If a stored URL slips outside the allowlist, uploads that currently work would
stop. Audit existing `frame_url`/`logo_url`/`storage_path` values against the
configured base before enabling the strict path.
