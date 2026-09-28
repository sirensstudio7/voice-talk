-- Greeting trigger mode: presence (dwell) or gesture (open palm)
ALTER TABLE vision_settings
  ADD COLUMN IF NOT EXISTS greeting_trigger_mode VARCHAR(20) NOT NULL DEFAULT 'presence';

ALTER TABLE vision_settings
  DROP CONSTRAINT IF EXISTS vision_settings_greeting_trigger_mode_check;

ALTER TABLE vision_settings
  ADD CONSTRAINT vision_settings_greeting_trigger_mode_check
  CHECK (greeting_trigger_mode IN ('presence', 'gesture'));
