-- LORESCALE LIVE add-on: sessions, attached products, chat. Isolated from kiosk voice.
INSERT INTO addons (
  id,
  code,
  name,
  description,
  price_display,
  monthly_price_idr,
  sort_order
)
VALUES (
  'addon-live',
  'live',
  'LORESCALE LIVE',
  'AI-hosted live room with chat, product cards, and your catalog — one Control Center.',
  'Rp199.000/month',
  199000,
  6
)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_display = EXCLUDED.price_display;

CREATE TABLE IF NOT EXISTS live_sessions (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, slug)
);

CREATE TABLE IF NOT EXISTS live_session_products (
  id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  product_id VARCHAR(36) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, product_id)
);

CREATE TABLE IF NOT EXISTS live_messages (
  id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  display_name VARCHAR(80) NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  product_id VARCHAR(36) REFERENCES products(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_sessions_business ON live_sessions (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_messages_session ON live_messages (session_id, created_at);
