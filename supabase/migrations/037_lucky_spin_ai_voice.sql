-- Toggle AI congratulations voice after a Lucky Spin win (off for live MC events).
ALTER TABLE lucky_spin_settings
  ADD COLUMN IF NOT EXISTS ai_voice_enabled BOOLEAN NOT NULL DEFAULT TRUE;
