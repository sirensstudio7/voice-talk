-- Merchant toggle to pause kiosk/voice booking without cancelling the subscription.
CREATE TABLE IF NOT EXISTS booking_settings (
  business_id VARCHAR(36) PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
