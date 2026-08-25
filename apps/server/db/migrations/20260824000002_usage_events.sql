-- +goose Up
CREATE TABLE IF NOT EXISTS usage_events (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id),
  event_type VARCHAR(100) NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_business ON usage_events(business_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_type ON usage_events(event_type, occurred_at);

-- +goose Down
DROP TABLE IF EXISTS usage_events;
