-- Plan-capped named kiosk displays with per-display PIN.

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS kiosk_display_limit INTEGER NOT NULL DEFAULT 1;

UPDATE plans SET kiosk_display_limit = 1 WHERE code IN ('trial', 'starter');
UPDATE plans SET kiosk_display_limit = 5 WHERE code = 'growth';
UPDATE plans SET kiosk_display_limit = 10 WHERE code = 'enterprise';

CREATE TABLE IF NOT EXISTS kiosk_displays (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(50) NOT NULL,
  password_hash VARCHAR(255) NOT NULL DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_kiosk_displays_business_slug
  ON kiosk_displays (business_id, slug);

CREATE UNIQUE INDEX IF NOT EXISTS uq_kiosk_displays_one_default
  ON kiosk_displays (business_id)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_kiosk_displays_business
  ON kiosk_displays (business_id, created_at);

INSERT INTO kiosk_displays (id, business_id, name, slug, password_hash, is_default)
SELECT
  gen_random_uuid()::text,
  b.id,
  'Main display',
  'default',
  '',
  TRUE
FROM businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM kiosk_displays d WHERE d.business_id = b.id AND d.slug = 'default'
);
