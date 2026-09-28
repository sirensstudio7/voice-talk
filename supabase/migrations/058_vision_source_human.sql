-- Allow Human (browser) as a vision_source. App already accepts this value;
-- Postgres CHECK from 016 only listed auto/python/browser.
ALTER TABLE vision_settings
  DROP CONSTRAINT IF EXISTS vision_settings_vision_source_check;

ALTER TABLE vision_settings
  ADD CONSTRAINT vision_settings_vision_source_check
  CHECK (vision_source IN ('auto', 'python', 'browser', 'human'));
