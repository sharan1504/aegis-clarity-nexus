-- Tighten profile visibility
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Admins can view profiles in their tenant"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  tenant_id IS NOT NULL
  AND app_private.is_tenant_member(tenant_id)
  AND app_private.has_role(auth.uid(), 'admin'::app_role)
);

-- Restrict tenant creation to first-time bootstrap only
CREATE OR REPLACE FUNCTION app_private.can_bootstrap_tenant()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.tenant_id IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
    )
$$;

REVOKE ALL ON FUNCTION app_private.can_bootstrap_tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.can_bootstrap_tenant() TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated users can create a tenant" ON public.tenants;

CREATE POLICY "Users without a tenant can bootstrap one"
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (app_private.can_bootstrap_tenant());