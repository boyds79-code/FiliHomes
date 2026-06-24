-- Enable public uploads (Insert) and downloads (Select) on storage.objects for required buckets
-- repairs, repair-photos, parcel-images, bazaar, receipts

-- Drop existing policies to prevent conflicts
DROP POLICY IF EXISTS "Public Access Select on repairs" ON storage.objects;
DROP POLICY IF EXISTS "Public Insert on repairs" ON storage.objects;
DROP POLICY IF EXISTS "Public Select on repair-photos" ON storage.objects;
DROP POLICY IF EXISTS "Public Insert on repair-photos" ON storage.objects;
DROP POLICY IF EXISTS "Public Select on parcel-images" ON storage.objects;
DROP POLICY IF EXISTS "Public Insert on parcel-images" ON storage.objects;
DROP POLICY IF EXISTS "Public Select on bazaar" ON storage.objects;
DROP POLICY IF EXISTS "Public Insert on bazaar" ON storage.objects;
DROP POLICY IF EXISTS "Public Select on receipts" ON storage.objects;
DROP POLICY IF EXISTS "Public Insert on receipts" ON storage.objects;

-- Create public SELECT policies
CREATE POLICY "Public Access Select on repairs" ON storage.objects FOR SELECT TO public USING (bucket_id = 'repairs');
CREATE POLICY "Public Select on repair-photos" ON storage.objects FOR SELECT TO public USING (bucket_id = 'repair-photos');
CREATE POLICY "Public Select on parcel-images" ON storage.objects FOR SELECT TO public USING (bucket_id = 'parcel-images');
CREATE POLICY "Public Select on bazaar" ON storage.objects FOR SELECT TO public USING (bucket_id = 'bazaar');
CREATE POLICY "Public Select on receipts" ON storage.objects FOR SELECT TO public USING (bucket_id = 'receipts');

-- Create public INSERT policies
CREATE POLICY "Public Insert on repairs" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'repairs');
CREATE POLICY "Public Insert on repair-photos" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'repair-photos');
CREATE POLICY "Public Insert on parcel-images" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'parcel-images');
CREATE POLICY "Public Insert on bazaar" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'bazaar');
CREATE POLICY "Public Insert on receipts" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'receipts');
