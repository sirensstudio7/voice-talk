-- Retire the Python sidecar: vision detection runs in the kiosk browser
-- (MediaPipe/Human). Existing rows fall back to browser-first "auto".
UPDATE vision_settings SET vision_source = 'auto' WHERE vision_source = 'python';

ALTER TABLE vision_settings
  DROP CONSTRAINT IF EXISTS vision_settings_vision_source_check;

ALTER TABLE vision_settings
  ADD CONSTRAINT vision_settings_vision_source_check
  CHECK (vision_source IN ('auto', 'browser', 'human'));
