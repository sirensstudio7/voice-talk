-- +goose Up
-- Ported from apps-legacy/server/src/db/schema.ts (the current, complete
-- Drizzle schema — not supabase/migrations/001_initial_schema.sql, which
-- only reflects the initial cut before ~15 later ALTERs). See
-- supabase/README.md history for the full incremental trail if needed.
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  phone VARCHAR(50) NOT NULL DEFAULT '',
  country VARCHAR(2) NOT NULL DEFAULT '',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

CREATE TABLE IF NOT EXISTS businesses (
  id VARCHAR(36) PRIMARY KEY,
  slug VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  tagline VARCHAR(500) NOT NULL DEFAULT '',
  voice_name VARCHAR(50) NOT NULL DEFAULT 'Aoede',
  gemini_model VARCHAR(100) NOT NULL DEFAULT 'gemini-3.1-flash-live-preview',
  payment_qr_url TEXT NOT NULL DEFAULT '',
  background_url TEXT NOT NULL DEFAULT '',
  gradient_color VARCHAR(7) NOT NULL DEFAULT '',
  display_orientation VARCHAR(10) NOT NULL DEFAULT 'landscape',
  business_type VARCHAR(50) NOT NULL DEFAULT '',
  primary_use_case VARCHAR(20) NOT NULL DEFAULT 'both',
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_businesses_slug ON businesses(slug);

CREATE TABLE IF NOT EXISTS business_members (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id),
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id),
  role VARCHAR(50) NOT NULL DEFAULT 'owner',
  CONSTRAINT uq_member UNIQUE (user_id, business_id)
);

CREATE INDEX IF NOT EXISTS idx_business_members_user ON business_members(user_id);
CREATE INDEX IF NOT EXISTS idx_business_members_business ON business_members(business_id);

-- +goose Down
DROP TABLE IF EXISTS business_members;
DROP TABLE IF EXISTS businesses;
DROP TABLE IF EXISTS users;
