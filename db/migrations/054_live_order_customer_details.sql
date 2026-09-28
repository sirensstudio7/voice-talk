-- Contact and delivery details for LIVE (and future) orders.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_address TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_notes TEXT NOT NULL DEFAULT '';
