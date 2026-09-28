-- Attribute voice conversations to a kiosk display for admin filtering.

ALTER TABLE voice_sessions
  ADD COLUMN IF NOT EXISTS kiosk_display_id VARCHAR(36) REFERENCES kiosk_displays(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_voice_sessions_kiosk_display
  ON voice_sessions (kiosk_display_id)
  WHERE kiosk_display_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_voice_sessions_business_kiosk_started
  ON voice_sessions (business_id, kiosk_display_id, started_at DESC);

UPDATE voice_sessions vs
SET kiosk_display_id = d.id
FROM kiosk_displays d
WHERE d.business_id = vs.business_id
  AND d.is_default = TRUE
  AND vs.kiosk_display_id IS NULL;
