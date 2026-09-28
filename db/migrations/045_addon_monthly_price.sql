-- Numeric monthly price for add-ons so platform pricing can drive checkout.
ALTER TABLE addons
  ADD COLUMN IF NOT EXISTS monthly_price_idr INTEGER NOT NULL DEFAULT 199000;

UPDATE addons
SET monthly_price_idr = 199000
WHERE monthly_price_idr IS NULL OR monthly_price_idr = 0;
