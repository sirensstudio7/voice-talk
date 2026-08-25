-- +goose Up
-- Ported from apps-legacy/server/src/db/schema.ts's `photoSettings`,
-- `photoSessions` tables (see docs/photomoment Phase 1 plan). No
-- addons/addon_subscriptions/addon_requests tables — Photo Moment ships
-- unconditionally available, gated only by photo_settings.enabled,
-- matching every other feature's free/unlimited treatment pre-launch.
CREATE TABLE IF NOT EXISTS photo_settings (
  business_id VARCHAR(36) PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  voice_prompt TEXT NOT NULL DEFAULT 'Terima kasih! Mau foto bareng untuk kenang-kenangan?',
  countdown_seconds INTEGER NOT NULL DEFAULT 3,
  qr_expiry_hours INTEGER NOT NULL DEFAULT 24,
  logo_url TEXT,
  frame_url TEXT,
  campaign_text TEXT,
  auto_delete_days INTEGER NOT NULL DEFAULT 7,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS photo_sessions (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id VARCHAR(36) REFERENCES orders(id) ON DELETE SET NULL,
  visitor_response VARCHAR(20),
  status VARCHAR(30) NOT NULL DEFAULT 'started',
  photo_path TEXT,
  thumbnail_path TEXT,
  qr_token VARCHAR(64) UNIQUE,
  download_expires_at TIMESTAMPTZ,
  downloaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photo_sessions_business_created ON photo_sessions(business_id, created_at);

-- +goose Down
DROP TABLE IF EXISTS photo_sessions;
DROP TABLE IF EXISTS photo_settings;
