# Legacy reference data (extracted before deleting `supabase/`)

`supabase/migrations/*.sql`, `supabase/setup-all.sql`, and
`supabase/setup-storage-only.sql` were deleted from the repo — the Node
server they supported (`apps-legacy/server`) is being fully rewritten, not
incrementally migrated, and `apps-legacy/server/src/db/schema.ts` (Drizzle)
already carries the complete, current table structure forward, so nothing
about the *shape* of the data was lost.

Two things lived **only** in `supabase/` — not in `schema.ts`, not in any
`apps-legacy` seed file — and would have been lost silently on deletion.
This file is where they live now, until the modules that actually need
them exist and this becomes real seed data / config instead of a note.

## 1. Plan catalog

Source: `supabase/migrations/024_account_subscriptions.sql`. Feeds the
`plans` table (not yet in the Go schema — lands with the
subscriptions/platform-admin module).

| code | name | workspace_limit | is_trial | sort_order |
|---|---|---|---|---|
| `trial` | Demo Trial | 1 | true | 0 |
| `starter` | Starter | 1 | false | 1 |
| `growth` | Growth | 5 | false | 2 |
| `enterprise` | Enterprise | 10 | false | 3 |

## 2. Addon catalog

Source: `supabase/migrations/027_smart_photo_moment.sql`. Feeds the
`addons` table (lands with the photomoment module).

| code | name | description | price_display | sort_order |
|---|---|---|---|---|
| `smart_photo_moment` | Smart Photo Moment | AI transaction-triggered souvenir photo with QR download. | Rp199.000/month | 1 |

## 3. Platform settings defaults

Source: `supabase/setup-all.sql`. Feeds the `platform_settings`
key/value table (lands with the platform-admin module).

| key | value |
|---|---|
| `default_ai_model` | `gemini-3.1-flash-live-preview` |
| `default_voice_provider` | `gemini` |
| `storage_quota_mb` | `1024` |
| `manual_mrr` | `0` |
| `maintenance_mode` | `false` |
| `feature_flags` | `{}` |

## 4. Storage bucket taxonomy → R2 prefix mapping

Source: `supabase/migrations/002_storage_buckets.sql`, `007`, `027`,
`028`, `030`. These were 8 separate Supabase Storage buckets, each with
its own public-read policy (or none, for the one private bucket).
Cloudflare R2 doesn't have per-bucket RLS policies the way Supabase
Storage does — `internal/platform/storage` already collapses this into
one bucket with path prefixes (`docs/TECHNICAL-ARCHITECTURE-SPEC.md`
§4.3), so this table is the mapping between the old and new scheme, not a
literal port.

| Supabase bucket | Public? | New R2 prefix |
|---|---|---|
| `payment-qr` | yes | `payments/` |
| `backgrounds` | yes | `products/` (business background images) |
| `product-images` | yes | `products/` |
| `assistant-avatars` | yes | `avatars/` |
| `photo-branding` | yes | `photos/` (branding overlays) |
| `lorescale-photos` | **no** | `photos/` (souvenir captures — keep private; serve via `Client.SignedURL`, not a public prefix) |
| `payment-proofs` | yes | `payments/` (addon payment proof uploads) |
| `presentation-assets` | yes | `presentations/` |

The one thing worth carrying forward deliberately: `lorescale-photos` was
the only private bucket (customer souvenir photos, downloaded via a
time-limited signed URL + QR code, not served from a public prefix). When
the photomoment module lands, don't flatten it into a publicly-readable
R2 prefix — it needs the same "generate on demand, expire the link"
treatment `storage.SignedURL` already supports.

No per-bucket size/MIME constraints existed at the SQL level in
`supabase/` — those lived in application code
(`apps-legacy/server/src/storage/index.ts`'s `MAX_UPLOAD_BYTES` /
`MAX_PHOTO_UPLOAD_BYTES` / `MAX_PRESENTATION_UPLOAD_BYTES`), already
ported as-is into `internal/platform/storage`'s size-limit constants.
