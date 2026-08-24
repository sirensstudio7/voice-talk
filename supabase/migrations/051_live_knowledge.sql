-- Standalone talking points for LORESCALE LIVE (not kiosk AI Knowledge).
CREATE TABLE IF NOT EXISTS live_knowledge_entries (
  id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_knowledge_session ON live_knowledge_entries (session_id, sort_order);
