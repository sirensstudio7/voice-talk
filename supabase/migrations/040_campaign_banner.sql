-- Campaign Banner add-on: catalog, settings, banners, storage bucket.

INSERT INTO addons (id, code, name, description, price_display, sort_order)
VALUES (
  'addon-campaign-banner',
  'campaign_banner',
  'Campaign Banner',
  'Scheduled promo banners on the AI kiosk with auto-slide, click-through, and impression analytics.',
  'Rp199.000/month',
  4
)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS campaign_banner_settings (
  business_id VARCHAR(36) PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  layout VARCHAR(20) NOT NULL DEFAULT 'top',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_banners (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  image_url TEXT NOT NULL DEFAULT '',
  target_url TEXT,
  qr_url TEXT,
  duration_sec INTEGER NOT NULL DEFAULT 5,
  display_order INTEGER NOT NULL DEFAULT 0,
  start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_banners_business
  ON campaign_banners(business_id);
CREATE INDEX IF NOT EXISTS idx_campaign_banners_active
  ON campaign_banners(business_id, is_active, display_order);
