ALTER TABLE products
  ADD COLUMN IF NOT EXISTS duration_min INTEGER NOT NULL DEFAULT 30;

CREATE TABLE IF NOT EXISTS business_hours (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  open_time VARCHAR(5) NOT NULL DEFAULT '09:00',
  close_time VARCHAR(5) NOT NULL DEFAULT '18:00',
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT uq_business_hours_day UNIQUE (business_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_business_hours_business ON business_hours(business_id);

CREATE TABLE IF NOT EXISTS appointments (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id VARCHAR(100) NOT NULL,
  treatment_name VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  voice_session_id VARCHAR(36) REFERENCES voice_sessions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_business ON appointments(business_id);
CREATE INDEX IF NOT EXISTS idx_appointments_starts_at ON appointments(starts_at);
