-- Idempotent order confirmation (TKT-018).
--
-- A kiosk retry after an ambiguous failure (timeout, reload) must return the
-- order it already created instead of inserting a duplicate. The partial unique
-- index only applies when a key was supplied, so every existing order and any
-- caller that does not send one keeps working.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS client_request_id VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_business_client_request
  ON orders (business_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
