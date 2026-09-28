-- Account-level AI Voice Minutes: plan allowances, lots + ledger, top-up catalog/orders.

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS monthly_price_idr INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yearly_price_idr INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_voice_seconds INTEGER NOT NULL DEFAULT 0;

UPDATE plans SET
  monthly_price_idr = 0,
  yearly_price_idr = 0,
  monthly_voice_seconds = 1800
WHERE code = 'trial';

UPDATE plans SET
  monthly_price_idr = 749000,
  yearly_price_idr = 7490000,
  monthly_voice_seconds = 18000
WHERE code = 'starter';

UPDATE plans SET
  monthly_price_idr = 2249000,
  yearly_price_idr = 22490000,
  monthly_voice_seconds = 90000
WHERE code = 'growth';

UPDATE plans SET
  monthly_price_idr = 5000000,
  yearly_price_idr = 60000000,
  monthly_voice_seconds = 300000
WHERE code = 'enterprise';

CREATE TABLE IF NOT EXISTS minute_grants (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id),
  kind VARCHAR(20) NOT NULL,
  granted_seconds INTEGER NOT NULL,
  remaining_seconds INTEGER NOT NULL,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  source_ref VARCHAR(120) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_minute_grants_source
  ON minute_grants (user_id, kind, source_ref);
CREATE INDEX IF NOT EXISTS idx_minute_grants_user_remaining
  ON minute_grants (user_id, remaining_seconds);
CREATE INDEX IF NOT EXISTS idx_minute_grants_expires
  ON minute_grants (expires_at);

CREATE TABLE IF NOT EXISTS minute_ledger (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id),
  workspace_id VARCHAR(36) REFERENCES businesses(id),
  voice_session_id VARCHAR(36) REFERENCES voice_sessions(id),
  grant_id VARCHAR(36) REFERENCES minute_grants(id),
  type VARCHAR(30) NOT NULL,
  delta_seconds INTEGER NOT NULL,
  balance_after_seconds INTEGER NOT NULL,
  idempotency_key VARCHAR(160) NOT NULL UNIQUE,
  source_ref VARCHAR(120) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_minute_ledger_user_created
  ON minute_ledger (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS topup_packages (
  id VARCHAR(36) PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  minutes INTEGER NOT NULL,
  price_idr INTEGER NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'IDR',
  expires_after_days INTEGER NOT NULL DEFAULT 90,
  is_popular BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO topup_packages (id, code, name, minutes, price_idr, currency, expires_after_days, is_popular, status, sort_order)
VALUES
  ('pkg-topup-small', 'small', 'Small', 100, 149000, 'IDR', 90, FALSE, 'active', 1),
  ('pkg-topup-medium', 'medium', 'Medium', 500, 599000, 'IDR', 90, TRUE, 'active', 2),
  ('pkg-topup-large', 'large', 'Large', 1500, 1490000, 'IDR', 90, FALSE, 'active', 3),
  ('pkg-topup-xl', 'xl', 'XL', 5000, 4490000, 'IDR', 90, FALSE, 'active', 4)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS topup_orders (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id),
  package_id VARCHAR(36) NOT NULL REFERENCES topup_packages(id),
  package_name VARCHAR(120) NOT NULL,
  minutes INTEGER NOT NULL,
  price_idr INTEGER NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'IDR',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_method VARCHAR(40) NOT NULL DEFAULT '',
  payment_proof_url TEXT,
  transaction_code VARCHAR(32) NOT NULL,
  payment_provider VARCHAR(40) NOT NULL DEFAULT '',
  payment_id VARCHAR(120) NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  reviewed_by VARCHAR(36) REFERENCES platform_admins(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_topup_orders_txn
  ON topup_orders (transaction_code);
CREATE INDEX IF NOT EXISTS idx_topup_orders_user
  ON topup_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_topup_orders_status
  ON topup_orders (status, created_at DESC);
