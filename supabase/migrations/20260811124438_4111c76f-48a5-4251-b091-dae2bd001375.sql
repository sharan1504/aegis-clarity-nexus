CREATE POLICY "Tenant members can read their report files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'reports'
    AND public.is_tenant_member(NULLIF(split_part(name, '/', 1), '')::uuid)
  );

CREATE POLICY "Tenant members can upload their report files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'reports'
    AND public.is_tenant_member(NULLIF(split_part(name, '/', 1), '')::uuid)
  );

CREATE POLICY "Tenant members can delete their report files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'reports'
    AND public.is_tenant_member(NULLIF(split_part(name, '/', 1), '')::uuid)
  );