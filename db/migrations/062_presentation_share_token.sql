-- Shareable audience link for AI Present (start without admin login).
ALTER TABLE presentations
  ADD COLUMN IF NOT EXISTS share_token VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS uq_presentations_share_token
  ON presentations (share_token)
  WHERE share_token IS NOT NULL;
