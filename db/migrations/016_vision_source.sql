-- Vision source: auto (Python if connected, else browser), python-only, or browser-only
ALTER TABLE vision_settings
  ADD COLUMN IF NOT EXISTS vision_source VARCHAR(20) NOT NULL DEFAULT 'auto';

ALTER TABLE vision_settings
  DROP CONSTRAINT IF EXISTS vision_settings_vision_source_check;

ALTER TABLE vision_settings
  ADD CONSTRAINT vision_settings_vision_source_check
  CHECK (vision_source IN ('auto', 'python', 'browser'));
