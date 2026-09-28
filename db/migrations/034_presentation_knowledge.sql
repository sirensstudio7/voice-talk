-- Dedicated knowledge entries scoped to a single presentation (deck).
CREATE TABLE IF NOT EXISTS presentation_knowledge_entries (
  id VARCHAR(36) PRIMARY KEY,
  presentation_id VARCHAR(36) NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presentation_knowledge_presentation
  ON presentation_knowledge_entries(presentation_id);
