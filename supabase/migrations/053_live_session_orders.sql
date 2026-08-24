-- Tag kiosk-style orders placed from a LORESCALE LIVE room so Control Room can list them.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS live_session_id VARCHAR(36) REFERENCES live_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_live_session ON orders (live_session_id, created_at DESC);
