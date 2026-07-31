-- Smart Photo Moment add-on: catalog, entitlements, settings, sessions, analytics.

CREATE TABLE IF NOT EXISTS addons (
  id VARCHAR(36) PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_display VARCHAR(50) NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO addons (id, code, name, description, price_display, sort_order)
VALUES (
  'addon-smart-photo-moment',
  'smart_photo_moment',
  'Smart Photo Moment',
  'AI transaction-triggered souvenir photo with QR download.',
  'Rp199.000/month',
  1
)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS addon_subscriptions (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  addon_code VARCHAR(50) NOT NULL REFERENCES addons(code),
  status VARCHAR(20) NOT NULL DEFAULT 'inactive',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, addon_code)
);

CREATE INDEX IF NOT EXISTS idx_addon_subscriptions_business ON addon_subscriptions(business_id);
CREATE INDEX IF NOT EXISTS idx_addon_subscriptions_status ON addon_subscriptions(status);

CREATE TABLE IF NOT EXISTS addon_requests (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id),
  addon_code VARCHAR(50) NOT NULL REFERENCES addons(code),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by VARCHAR(36) REFERENCES platform_admins(id),
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_addon_requests_status ON addon_requests(status);
CREATE INDEX IF NOT EXISTS idx_addon_requests_business ON addon_requests(business_id);
CREATE INDEX IF NOT EXISTS idx_addon_requests_created ON addon_requests(created_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_photo_sessions_business ON photo_sessions(business_id);
CREATE INDEX IF NOT EXISTS idx_photo_sessions_created ON photo_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photo_sessions_qr_token ON photo_sessions(qr_token);
CREATE INDEX IF NOT EXISTS idx_photo_sessions_status ON photo_sessions(status);

CREATE TABLE IF NOT EXISTS analytics_events (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  event_name VARCHAR(50) NOT NULL,
  photo_session_id VARCHAR(36) REFERENCES photo_sessions(id) ON DELETE SET NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_business ON analytics_events(business_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at DESC);

-- Private photo bucket + public branding assets for overlays.
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('lorescale-photos', 'lorescale-photos', false),
  ('photo-branding', 'photo-branding', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read photo-branding" ON storage.objects;
CREATE POLICY "Public read photo-branding"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'photo-branding');

DROP POLICY IF EXISTS "Service upload photo-branding" ON storage.objects;
CREATE POLICY "Service upload photo-branding"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'photo-branding');

DROP POLICY IF EXISTS "Service update photo-branding" ON storage.objects;
CREATE POLICY "Service update photo-branding"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'photo-branding');

DROP POLICY IF EXISTS "Service delete photo-branding" ON storage.objects;
CREATE POLICY "Service delete photo-branding"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'photo-branding');

DROP POLICY IF EXISTS "Service upload lorescale-photos" ON storage.objects;
CREATE POLICY "Service upload lorescale-photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'lorescale-photos');

DROP POLICY IF EXISTS "Service update lorescale-photos" ON storage.objects;
CREATE POLICY "Service update lorescale-photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'lorescale-photos');

DROP POLICY IF EXISTS "Service delete lorescale-photos" ON storage.objects;
CREATE POLICY "Service delete lorescale-photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'lorescale-photos');

DROP POLICY IF EXISTS "Service select lorescale-photos" ON storage.objects;
CREATE POLICY "Service select lorescale-photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lorescale-photos');
