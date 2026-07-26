-- Vision-based conversation trigger settings (1:1 with businesses)
CREATE TABLE IF NOT EXISTS vision_settings (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id VARCHAR(36) NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  camera_trigger_enabled BOOLEAN NOT NULL DEFAULT false,
  greeting_delay_seconds INTEGER NOT NULL DEFAULT 3,
  detection_distance_m DOUBLE PRECISION NOT NULL DEFAULT 2.0,
  cooldown_seconds INTEGER NOT NULL DEFAULT 30,
  lost_timeout_seconds INTEGER NOT NULL DEFAULT 5,
  silence_timeout_seconds INTEGER NOT NULL DEFAULT 15,
  auto_goodbye_timeout_seconds INTEGER NOT NULL DEFAULT 10,
  greeting_script TEXT NOT NULL DEFAULT 'Hello, welcome. How may I assist you today?',
  goodbye_script TEXT NOT NULL DEFAULT 'Thank you. Have a wonderful day.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vision_settings_business ON vision_settings(business_id);

-- Vision analytics events
CREATE TABLE IF NOT EXISTS vision_events (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kiosk_id VARCHAR(100) NOT NULL DEFAULT 'default',
  event_type VARCHAR(50) NOT NULL,
  track_id INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vision_events_business_created ON vision_events(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vision_events_type ON vision_events(event_type);
