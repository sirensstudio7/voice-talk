-- Lucky Spin add-on: catalog entry, settings, campaigns, prizes, winners.

INSERT INTO addons (id, code, name, description, price_display, sort_order)
VALUES (
  'addon-lucky-spin',
  'lucky_spin',
  'Lucky Spin',
  'Branded lucky-spin campaigns with prizes, vouchers, and customer-screen widget.',
  'Rp199.000/month',
  2
)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS lucky_spin_settings (
  business_id VARCHAR(36) PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lucky_spin_campaigns (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  daily_limit INTEGER,
  total_limit INTEGER,
  one_per_user BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lucky_spin_campaigns_business
  ON lucky_spin_campaigns(business_id);
CREATE INDEX IF NOT EXISTS idx_lucky_spin_campaigns_status
  ON lucky_spin_campaigns(business_id, status);

CREATE TABLE IF NOT EXISTS lucky_spin_prizes (
  id VARCHAR(36) PRIMARY KEY,
  campaign_id VARCHAR(36) NOT NULL REFERENCES lucky_spin_campaigns(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  probability NUMERIC(5,2) NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  voucher_prefix VARCHAR(20) NOT NULL DEFAULT 'SPIN',
  expires_at TIMESTAMPTZ,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lucky_spin_prizes_campaign
  ON lucky_spin_prizes(campaign_id);

CREATE TABLE IF NOT EXISTS lucky_spin_winners (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  campaign_id VARCHAR(36) NOT NULL REFERENCES lucky_spin_campaigns(id) ON DELETE CASCADE,
  prize_id VARCHAR(36) NOT NULL REFERENCES lucky_spin_prizes(id) ON DELETE RESTRICT,
  customer_identifier VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255),
  voucher_code VARCHAR(100) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  won_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  redeemed_at TIMESTAMPTZ,
  redeemed_by VARCHAR(36)
);

CREATE INDEX IF NOT EXISTS idx_lucky_spin_winners_business
  ON lucky_spin_winners(business_id);
CREATE INDEX IF NOT EXISTS idx_lucky_spin_winners_campaign
  ON lucky_spin_winners(campaign_id);
CREATE INDEX IF NOT EXISTS idx_lucky_spin_winners_voucher
  ON lucky_spin_winners(voucher_code);
CREATE INDEX IF NOT EXISTS idx_lucky_spin_winners_customer
  ON lucky_spin_winners(campaign_id, customer_identifier);

-- Public prize images (Supabase only; local migrate skips this section).
