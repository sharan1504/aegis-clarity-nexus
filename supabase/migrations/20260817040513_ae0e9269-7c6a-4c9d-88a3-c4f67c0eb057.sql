-- 1) Prevent self privilege escalation: admins may manage other members' roles
--    but never rewrite their own role row (which is how a demoted-but-still-
--    admin session could lock in permanent elevation).
DROP POLICY IF EXISTS "Admins can update roles in tenant" ON public.user_roles;
CREATE POLICY "Admins can update other members roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  user_id <> auth.uid()
  AND app_private.is_tenant_member(tenant_id)
  AND app_private.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  user_id <> auth.uid()
  AND app_private.is_tenant_member(tenant_id)
  AND app_private.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Admins can delete roles in tenant" ON public.user_roles;
CREATE POLICY "Admins can delete other members roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  user_id <> auth.uid()
  AND app_private.is_tenant_member(tenant_id)
  AND app_private.has_role(auth.uid(), 'admin'::app_role)
);

-- 2) Report files: an object could previously be overwritten/moved with no
--    UPDATE policy in place, so add an explicit tenant-scoped rule that also
--    forces the new path to stay inside the same workspace prefix.
DROP POLICY IF EXISTS "Tenant members can update their report files" ON storage.objects;
CREATE POLICY "Tenant members can update their report files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'reports'
  AND app_private.is_tenant_member((NULLIF(split_part(name, '/', 1), ''))::uuid)
)
WITH CHECK (
  bucket_id = 'reports'
  AND app_private.is_tenant_member((NULLIF(split_part(name, '/', 1), ''))::uuid)
);