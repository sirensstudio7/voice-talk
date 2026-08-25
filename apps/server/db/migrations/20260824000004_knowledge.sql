-- +goose Up
-- Ported from apps-legacy/server/src/db/schema.ts's `ai_rules` and
-- `knowledge_entries` tables. One deliberate simplification: legacy's
-- knowledge_entries.title is nullable (empty title -> NULL); here it's
-- NOT NULL DEFAULT '' instead — same effective "no title" semantics for
-- callers, without a nullable column's COALESCE-partial-update ambiguity
-- (see db/queries/knowledge_entries.sql).
CREATE TABLE IF NOT EXISTS ai_rules (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL UNIQUE REFERENCES businesses(id),
  assistant_name VARCHAR(50) NOT NULL DEFAULT 'Lorescale',
  avatar_url TEXT NOT NULL DEFAULT '',
  avatar_model_path TEXT NOT NULL DEFAULT '',
  personality TEXT NOT NULL,
  tone VARCHAR(20) NOT NULL DEFAULT 'friendly',
  language VARCHAR(5) NOT NULL DEFAULT 'id',
  behavioral_rules TEXT NOT NULL DEFAULT '',
  tool_instructions TEXT NOT NULL DEFAULT '',
  idle_timeout_seconds INTEGER NOT NULL DEFAULT 30,
  voice_preset VARCHAR(30) NOT NULL DEFAULT 'natural',
  voice_gender VARCHAR(10) NOT NULL DEFAULT 'female'
);

CREATE TABLE IF NOT EXISTS knowledge_entries (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id),
  category VARCHAR(100) NOT NULL DEFAULT 'General',
  title VARCHAR(200) NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_knowledge_entries_business ON knowledge_entries(business_id);

-- +goose Down
DROP TABLE IF EXISTS knowledge_entries;
DROP TABLE IF EXISTS ai_rules;
