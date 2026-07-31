-- AI Presenter domain (presentations, slides, sessions, Q&A).
-- Tenant key is business_id (VoiceTalk convention).

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
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presentations_business ON presentations(business_id);
CREATE INDEX IF NOT EXISTS idx_presentations_status ON presentations(business_id, status);

CREATE TABLE IF NOT EXISTS presentation_files (
  id VARCHAR(36) PRIMARY KEY,
  presentation_id VARCHAR(36) NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
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
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (presentation_id, slide_number)
);

CREATE INDEX IF NOT EXISTS idx_presentation_slides_presentation ON presentation_slides(presentation_id);

CREATE TABLE IF NOT EXISTS presentation_audio_assets (
  id VARCHAR(36) PRIMARY KEY,
  slide_id VARCHAR(36) NOT NULL REFERENCES presentation_slides(id) ON DELETE CASCADE,
  kind VARCHAR(50) NOT NULL DEFAULT 'slide',
  provider VARCHAR(50) NOT NULL DEFAULT 'gemini',
  storage_path TEXT NOT NULL DEFAULT '',
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presentation_audio_slide ON presentation_audio_assets(slide_id);

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

CREATE INDEX IF NOT EXISTS idx_presentation_questions_session ON presentation_questions(session_id);

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

-- Presentation assets bucket (PPT, audio). Public for MVP playback simplicity.
INSERT INTO storage.buckets (id, name, public)
VALUES ('presentation-assets', 'presentation-assets', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read presentation-assets" ON storage.objects;
CREATE POLICY "Public read presentation-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'presentation-assets');

DROP POLICY IF EXISTS "Service upload presentation-assets" ON storage.objects;
CREATE POLICY "Service upload presentation-assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'presentation-assets');

DROP POLICY IF EXISTS "Service update presentation-assets" ON storage.objects;
CREATE POLICY "Service update presentation-assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'presentation-assets');

DROP POLICY IF EXISTS "Service delete presentation-assets" ON storage.objects;
CREATE POLICY "Service delete presentation-assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'presentation-assets');
