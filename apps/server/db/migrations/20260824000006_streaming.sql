-- +goose Up
-- Ported from apps-legacy/server/src/db/schema.ts's `voice_sessions`,
-- `transcript_messages`, `orders`, `order_items` tables — the streaming
-- module's persistence layer (see docs/streaming Phase 1 plan).
CREATE TABLE IF NOT EXISTS voice_sessions (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id),
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  end_reason VARCHAR(50),
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

CREATE INDEX IF NOT EXISTS idx_transcript_messages_session ON transcript_messages(voice_session_id, created_at);

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

-- +goose Down
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS transcript_messages;
DROP TABLE IF EXISTS voice_sessions;
