-- VoiceTalk: run this ENTIRE file in Supabase SQL Editor (one query).
-- Do NOT paste the file path — paste this SQL content.

-- ========== PART 1: TABLES ==========

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

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

CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id),
  product_id VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  discount_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  category VARCHAR(100) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT uq_product_slug UNIQUE (business_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);

CREATE TABLE IF NOT EXISTS knowledge_entries (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id),
  category VARCHAR(100) NOT NULL DEFAULT 'General',
  content TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_knowledge_business ON knowledge_entries(business_id);

CREATE TABLE IF NOT EXISTS ai_rules (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL UNIQUE REFERENCES businesses(id),
  assistant_name VARCHAR(50) NOT NULL DEFAULT 'Eva',
  personality TEXT NOT NULL,
  tone VARCHAR(20) NOT NULL DEFAULT 'friendly',
  language VARCHAR(5) NOT NULL DEFAULT 'id',
  behavioral_rules TEXT NOT NULL DEFAULT '',
  tool_instructions TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_ai_rules_business ON ai_rules(business_id);

CREATE TABLE IF NOT EXISTS voice_sessions (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id),
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_business ON voice_sessions(business_id);

CREATE TABLE IF NOT EXISTS transcript_messages (
  id VARCHAR(36) PRIMARY KEY,
  voice_session_id VARCHAR(36) NOT NULL REFERENCES voice_sessions(id),
  role VARCHAR(20) NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transcript_session ON transcript_messages(voice_session_id);

CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id),
  voice_session_id VARCHAR(36) REFERENCES voice_sessions(id),
  status VARCHAR(50) NOT NULL DEFAULT 'open',
  total DOUBLE PRECISION NOT NULL DEFAULT 0,
  customer_name VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_business ON orders(business_id);
CREATE INDEX IF NOT EXISTS idx_orders_voice_session ON orders(voice_session_id);

CREATE TABLE IF NOT EXISTS order_items (
  id VARCHAR(36) PRIMARY KEY,
  order_id VARCHAR(36) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ========== PART 2: STORAGE BUCKETS ==========
-- Note: Postgres does not support CREATE POLICY IF NOT EXISTS — we DROP then CREATE.

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('payment-qr', 'payment-qr', true),
  ('backgrounds', 'backgrounds', true),
  ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read payment-qr" ON storage.objects;
CREATE POLICY "Public read payment-qr"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'payment-qr');

DROP POLICY IF EXISTS "Public read backgrounds" ON storage.objects;
CREATE POLICY "Public read backgrounds"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'backgrounds');

DROP POLICY IF EXISTS "Public read product-images" ON storage.objects;
CREATE POLICY "Public read product-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Service upload payment-qr" ON storage.objects;
CREATE POLICY "Service upload payment-qr"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'payment-qr');

DROP POLICY IF EXISTS "Service upload backgrounds" ON storage.objects;
CREATE POLICY "Service upload backgrounds"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'backgrounds');

DROP POLICY IF EXISTS "Service upload product-images" ON storage.objects;
CREATE POLICY "Service upload product-images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Service update payment-qr" ON storage.objects;
CREATE POLICY "Service update payment-qr"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'payment-qr');

DROP POLICY IF EXISTS "Service update backgrounds" ON storage.objects;
CREATE POLICY "Service update backgrounds"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'backgrounds');

DROP POLICY IF EXISTS "Service update product-images" ON storage.objects;
CREATE POLICY "Service update product-images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Service delete payment-qr" ON storage.objects;
CREATE POLICY "Service delete payment-qr"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'payment-qr');

DROP POLICY IF EXISTS "Service delete backgrounds" ON storage.objects;
CREATE POLICY "Service delete backgrounds"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'backgrounds');

DROP POLICY IF EXISTS "Service delete product-images" ON storage.objects;
CREATE POLICY "Service delete product-images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'product-images');
