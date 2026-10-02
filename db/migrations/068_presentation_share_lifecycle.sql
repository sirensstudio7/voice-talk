-- Presentation share-link lifecycle (TKT-012): revoke and optional expiry.
--
-- The share token is a bearer credential. Instead of only being able to delete
-- the token (losing all audit of the link), admins can revoke it and the public
-- routes answer 410 Gone; rotation replaces the token and clears the state.

ALTER TABLE presentations
  ADD COLUMN IF NOT EXISTS share_token_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS share_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS share_token_revoked_at TIMESTAMPTZ;
