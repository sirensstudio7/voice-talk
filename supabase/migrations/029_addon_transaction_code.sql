-- Human-readable tracking code for add-on payment requests.
ALTER TABLE addon_requests
  ADD COLUMN IF NOT EXISTS transaction_code VARCHAR(32);

UPDATE addon_requests
SET transaction_code = 'SPM-' || UPPER(SUBSTR(REPLACE(id::text, '-', ''), 1, 8))
WHERE transaction_code IS NULL;

ALTER TABLE addon_requests
  ALTER COLUMN transaction_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_addon_requests_transaction_code
  ON addon_requests(transaction_code);
