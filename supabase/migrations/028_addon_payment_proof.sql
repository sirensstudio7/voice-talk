-- Payment proof uploads for add-on checkout requests.
ALTER TABLE addon_requests
  ADD COLUMN IF NOT EXISTS payment_proof_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read payment-proofs" ON storage.objects;
CREATE POLICY "Public read payment-proofs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'payment-proofs');

DROP POLICY IF EXISTS "Service upload payment-proofs" ON storage.objects;
CREATE POLICY "Service upload payment-proofs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'payment-proofs');

DROP POLICY IF EXISTS "Service update payment-proofs" ON storage.objects;
CREATE POLICY "Service update payment-proofs"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'payment-proofs');

DROP POLICY IF EXISTS "Service delete payment-proofs" ON storage.objects;
CREATE POLICY "Service delete payment-proofs"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'payment-proofs');
