-- Single active unlock lease per kiosk display (PIN unlock session).

ALTER TABLE kiosk_displays
  ADD COLUMN IF NOT EXISTS unlock_session_id VARCHAR(36),
  ADD COLUMN IF NOT EXISTS unlock_leased_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unlock_lease_expires_at TIMESTAMPTZ;
