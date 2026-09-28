-- Add raise_hand greeting trigger mode (hold raised hand, no wave motion)
ALTER TABLE vision_settings
  DROP CONSTRAINT IF EXISTS vision_settings_greeting_trigger_mode_check;

ALTER TABLE vision_settings
  ADD CONSTRAINT vision_settings_greeting_trigger_mode_check
  CHECK (greeting_trigger_mode IN ('presence', 'gesture', 'raise_hand'));
