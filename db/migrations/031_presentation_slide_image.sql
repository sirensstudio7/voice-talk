-- Store rendered slide images from uploaded PPTX.
ALTER TABLE presentation_slides
  ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT '';
