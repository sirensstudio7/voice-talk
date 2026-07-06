-- Storage buckets for payment QR, backgrounds, and product images.
-- Run in Supabase SQL editor (Part 2 only, if tables already exist from 001).

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('payment-qr', 'payment-qr', true),
  ('backgrounds', 'backgrounds', true),
  ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read payment-qr" ON storage.objects;
CREATE POLICY "Public read payment-qr"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'payment-qr');

DROP POLICY IF EXISTS "Public read backgrounds" ON storage.objects;
CREATE POLICY "Public read backgrounds"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'backgrounds');

DROP POLICY IF EXISTS "Public read product-images" ON storage.objects;
CREATE POLICY "Public read product-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Service upload payment-qr" ON storage.objects;
CREATE POLICY "Service upload payment-qr"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'payment-qr');

DROP POLICY IF EXISTS "Service upload backgrounds" ON storage.objects;
CREATE POLICY "Service upload backgrounds"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'backgrounds');

DROP POLICY IF EXISTS "Service upload product-images" ON storage.objects;
CREATE POLICY "Service upload product-images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Service update payment-qr" ON storage.objects;
CREATE POLICY "Service update payment-qr"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'payment-qr');

DROP POLICY IF EXISTS "Service update backgrounds" ON storage.objects;
CREATE POLICY "Service update backgrounds"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'backgrounds');

DROP POLICY IF EXISTS "Service update product-images" ON storage.objects;
CREATE POLICY "Service update product-images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Service delete payment-qr" ON storage.objects;
CREATE POLICY "Service delete payment-qr"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'payment-qr');

DROP POLICY IF EXISTS "Service delete backgrounds" ON storage.objects;
CREATE POLICY "Service delete backgrounds"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'backgrounds');

DROP POLICY IF EXISTS "Service delete product-images" ON storage.objects;
CREATE POLICY "Service delete product-images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'product-images');
