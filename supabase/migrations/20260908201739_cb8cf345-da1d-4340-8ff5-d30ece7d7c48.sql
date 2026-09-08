CREATE OR REPLACE FUNCTION app_private.can_join_tenant(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND _tenant_id IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.tenant_id = _tenant_id)
      OR app_private.can_claim_tenant(_tenant_id)
    )
$function$;

REVOKE ALL ON FUNCTION app_private.can_join_tenant(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.can_claim_tenant(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.can_bootstrap_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND (
    tenant_id IS NULL
    OR app_private.is_tenant_member(tenant_id)
    OR app_private.can_claim_tenant(tenant_id)
  )
);

DROP POLICY IF EXISTS "Bootstrap own role or admin assigns roles" ON public.user_roles;
CREATE POLICY "Bootstrap own role or admin assigns roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  (app_private.is_tenant_member(tenant_id) AND app_private.has_role(auth.uid(), 'admin'::public.app_role) AND user_id <> auth.uid())
  OR (user_id = auth.uid() AND app_private.can_bootstrap_role(tenant_id, role))
);