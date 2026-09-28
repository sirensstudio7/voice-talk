-- First-slide thumbnail for presentation list cards.
ALTER TABLE presentations
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT NOT NULL DEFAULT '';
