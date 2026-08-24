-- Keyboard / hardware-button shortcut to start a kiosk session when camera trigger is off.

ALTER TABLE vision_settings
  ADD COLUMN IF NOT EXISTS start_hotkey VARCHAR(32) NOT NULL DEFAULT 'Enter';
