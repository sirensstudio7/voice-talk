-- Public read + service write for campaign banner images.

DROP POLICY IF EXISTS "Public read campaign-banners" ON storage.objects;
CREATE POLICY "Public read campaign-banners"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'campaign-banners');

DROP POLICY IF EXISTS "Service upload campaign-banners" ON storage.objects;
CREATE POLICY "Service upload campaign-banners"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'campaign-banners');

DROP POLICY IF EXISTS "Service update campaign-banners" ON storage.objects;
CREATE POLICY "Service update campaign-banners"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'campaign-banners');

DROP POLICY IF EXISTS "Service delete campaign-banners" ON storage.objects;
CREATE POLICY "Service delete campaign-banners"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'campaign-banners');
