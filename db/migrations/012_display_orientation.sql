ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS display_orientation VARCHAR(10) NOT NULL DEFAULT 'landscape';
