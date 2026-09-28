-- Payment proof uploads for add-on checkout requests.
ALTER TABLE addon_requests
  ADD COLUMN IF NOT EXISTS payment_proof_url TEXT;
