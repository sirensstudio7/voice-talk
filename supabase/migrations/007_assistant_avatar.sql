ALTER TABLE ai_rules
  ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '';

INSERT INTO storage.buckets (id, name, public)
VALUES ('assistant-avatars', 'assistant-avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read assistant-avatars" ON storage.objects;
CREATE POLICY "Public read assistant-avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'assistant-avatars');

DROP POLICY IF EXISTS "Service upload assistant-avatars" ON storage.objects;
CREATE POLICY "Service upload assistant-avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'assistant-avatars');

DROP POLICY IF EXISTS "Service update assistant-avatars" ON storage.objects;
CREATE POLICY "Service update assistant-avatars"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'assistant-avatars');

DROP POLICY IF EXISTS "Service delete assistant-avatars" ON storage.objects;
CREATE POLICY "Service delete assistant-avatars"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'assistant-avatars');
