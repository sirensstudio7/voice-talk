-- +goose Up
-- Ported from apps-legacy/server/src/db/schema.ts's `business_hours` and
-- `appointments` tables. appointments.voice_session_id (nullable FK to a
-- voice_sessions table) is omitted here — voice_sessions doesn't exist
-- yet (it's created by the streaming module); it's a trivial additive
-- migration to add back once that module lands.
CREATE TABLE IF NOT EXISTS business_hours (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id),
  day_of_week INTEGER NOT NULL,
  open_time VARCHAR(5) NOT NULL DEFAULT '09:00',
  close_time VARCHAR(5) NOT NULL DEFAULT '18:00',
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT uq_business_hours_day UNIQUE (business_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS appointments (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id),
  product_id VARCHAR(100) NOT NULL,
  treatment_name VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_business_starts ON appointments(business_id, starts_at);

-- +goose Down
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS business_hours;
