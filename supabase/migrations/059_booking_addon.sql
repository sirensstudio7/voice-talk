-- Voice booking add-on: doctors, per-doctor hours, services, appointments.staff_id
INSERT INTO addons (
  id,
  code,
  name,
  description,
  price_display,
  monthly_price_idr,
  sort_order
)
VALUES (
  'addon-booking',
  'booking',
  'Booking',
  'Let visitors book a doctor (or staff) by voice. Add people, set their hours, and take appointments from the kiosk.',
  'Rp199.000/month',
  199000,
  7
)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_display = EXCLUDED.price_display;

CREATE TABLE IF NOT EXISTS booking_staff (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  specialty VARCHAR(255) NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_staff_business ON booking_staff (business_id, sort_order, name);

CREATE TABLE IF NOT EXISTS booking_staff_hours (
  id VARCHAR(36) PRIMARY KEY,
  staff_id VARCHAR(36) NOT NULL REFERENCES booking_staff(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  open_time VARCHAR(5) NOT NULL DEFAULT '09:00',
  close_time VARCHAR(5) NOT NULL DEFAULT '18:00',
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT uq_booking_staff_hours_day UNIQUE (staff_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_booking_staff_hours_staff ON booking_staff_hours (staff_id);

CREATE TABLE IF NOT EXISTS booking_services (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 30,
  price DOUBLE PRECISION NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_services_business ON booking_services (business_id, sort_order, name);

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS staff_id VARCHAR(36) REFERENCES booking_staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_staff ON appointments (staff_id);
