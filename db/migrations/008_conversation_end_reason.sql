ALTER TABLE voice_sessions
  ADD COLUMN IF NOT EXISTS end_reason VARCHAR(50);
