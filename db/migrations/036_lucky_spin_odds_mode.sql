-- Campaign-level odds mode: auto (from stock) or manual percentages.
ALTER TABLE lucky_spin_campaigns
  ADD COLUMN IF NOT EXISTS odds_mode VARCHAR(20) NOT NULL DEFAULT 'auto';
