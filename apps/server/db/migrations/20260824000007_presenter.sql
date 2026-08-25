-- +goose Up
-- Ported from apps-legacy/server/src/db/schema.ts's `presentations`,
-- `presentationFiles`, `presentationSlides`, `presentationAudioAssets`,
-- `presentationSessions`, `presentationQuestions`, `presentationEmbeddings`,
-- `presentationKnowledgeEntries` tables (see docs/presenter Phase 1 plan).
-- presentation_audio_assets is schema-only this phase — no code writes to
-- it until the live-narration Phase 2 adds batch TTS.
CREATE TABLE IF NOT EXISTS presentations (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(500) NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  language VARCHAR(20) NOT NULL DEFAULT 'en',
  category VARCHAR(100) NOT NULL DEFAULT '',
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  processing_step VARCHAR(50) NOT NULL DEFAULT '',
  processing_error TEXT NOT NULL DEFAULT '',
  total_slides INTEGER NOT NULL DEFAULT 0,
  estimated_duration INTEGER NOT NULL DEFAULT 0,
  greeting_script TEXT NOT NULL DEFAULT '',
  closing_script TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT NOT NULL DEFAULT '',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presentations_business ON presentations(business_id);

CREATE TABLE IF NOT EXISTS presentation_files (
  id VARCHAR(36) PRIMARY KEY,
  presentation_id VARCHAR(36) NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL DEFAULT '',
  status VARCHAR(50) NOT NULL DEFAULT 'uploaded',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presentation_files_presentation ON presentation_files(presentation_id);

CREATE TABLE IF NOT EXISTS presentation_slides (
  id VARCHAR(36) PRIMARY KEY,
  presentation_id VARCHAR(36) NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
  slide_number INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  script TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (presentation_id, slide_number)
);

CREATE INDEX IF NOT EXISTS idx_presentation_slides_presentation ON presentation_slides(presentation_id, slide_number);

CREATE TABLE IF NOT EXISTS presentation_audio_assets (
  id VARCHAR(36) PRIMARY KEY,
  slide_id VARCHAR(36) NOT NULL REFERENCES presentation_slides(id) ON DELETE CASCADE,
  kind VARCHAR(50) NOT NULL DEFAULT 'slide',
  provider VARCHAR(50) NOT NULL DEFAULT 'gemini',
  storage_path TEXT NOT NULL DEFAULT '',
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presentation_audio_assets_slide ON presentation_audio_assets(slide_id);

CREATE TABLE IF NOT EXISTS presentation_sessions (
  id VARCHAR(36) PRIMARY KEY,
  presentation_id VARCHAR(36) NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL DEFAULT '',
  status VARCHAR(50) NOT NULL DEFAULT 'initializing',
  current_slide_number INTEGER NOT NULL DEFAULT 0,
  enable_qna BOOLEAN NOT NULL DEFAULT TRUE,
  auto_start BOOLEAN NOT NULL DEFAULT TRUE,
  audience_count INTEGER NOT NULL DEFAULT 0,
  question_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presentation_sessions_presentation ON presentation_sessions(presentation_id);
CREATE INDEX IF NOT EXISTS idx_presentation_sessions_business ON presentation_sessions(business_id);

CREATE TABLE IF NOT EXISTS presentation_questions (
  id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL REFERENCES presentation_sessions(id) ON DELETE CASCADE,
  question TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL DEFAULT '',
  status VARCHAR(50) NOT NULL DEFAULT 'incoming',
  moderation_result TEXT NOT NULL DEFAULT '{}',
  source_references TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_presentation_questions_session ON presentation_questions(session_id, created_at);

CREATE TABLE IF NOT EXISTS presentation_embeddings (
  id VARCHAR(36) PRIMARY KEY,
  presentation_id VARCHAR(36) NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
  source_type VARCHAR(50) NOT NULL,
  source_id VARCHAR(36),
  chunk_text TEXT NOT NULL DEFAULT '',
  embedding_reference TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presentation_embeddings_presentation ON presentation_embeddings(presentation_id);

CREATE TABLE IF NOT EXISTS presentation_knowledge_entries (
  id VARCHAR(36) PRIMARY KEY,
  presentation_id VARCHAR(36) NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presentation_knowledge_entries_presentation ON presentation_knowledge_entries(presentation_id);

-- +goose Down
DROP TABLE IF EXISTS presentation_knowledge_entries;
DROP TABLE IF EXISTS presentation_embeddings;
DROP TABLE IF EXISTS presentation_questions;
DROP TABLE IF EXISTS presentation_sessions;
DROP TABLE IF EXISTS presentation_audio_assets;
DROP TABLE IF EXISTS presentation_slides;
DROP TABLE IF EXISTS presentation_files;
DROP TABLE IF EXISTS presentations;
