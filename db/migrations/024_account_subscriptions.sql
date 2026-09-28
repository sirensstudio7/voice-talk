-- Account-level entitlements (trial + paid plans) and subscription requests.
-- Per-business `subscriptions` remains for workspace bookkeeping; account row is source of truth for limits/access.

CREATE TABLE IF NOT EXISTS plans (
  id VARCHAR(36) PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  workspace_limit INTEGER NOT NULL,
  is_trial BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO plans (id, code, name, workspace_limit, is_trial, sort_order)
VALUES
  ('plan-trial', 'trial', 'Demo Trial', 1, TRUE, 0),
  ('plan-starter', 'starter', 'Starter', 1, FALSE, 1),
  ('plan-growth', 'growth', 'Growth', 5, FALSE, 2),
  ('plan-enterprise', 'enterprise', 'Enterprise', 10, FALSE, 3)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS account_subscriptions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL UNIQUE REFERENCES users(id),
  plan_id VARCHAR(36) NOT NULL REFERENCES plans(id),
  status VARCHAR(20) NOT NULL DEFAULT 'trialing',
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  workspace_limit INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_subscriptions_status ON account_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_account_subscriptions_trial_ends ON account_subscriptions(trial_ends_at);

CREATE TABLE IF NOT EXISTS subscription_requests (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id),
  requested_plan_id VARCHAR(36) NOT NULL REFERENCES plans(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by VARCHAR(36) REFERENCES platform_admins(id),
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_subscription_requests_status ON subscription_requests(status);
CREATE INDEX IF NOT EXISTS idx_subscription_requests_user ON subscription_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_requests_created ON subscription_requests(created_at DESC);
