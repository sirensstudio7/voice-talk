-- Store registration country (ISO 3166-1 alpha-2) for locale-aware pricing
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS country VARCHAR(2) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_users_country ON users(country);
