CREATE TABLE IF NOT EXISTS user_api_keys (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  label VARCHAR(100) NOT NULL DEFAULT '',
  api_key TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_api_keys_user_provider UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS user_api_keys_user_id_idx ON user_api_keys (user_id);
