-- User-management security hardening.
-- Tenant membership is derived from the authenticated user's profile; clients cannot
-- choose a tenant while listing or creating memberships.

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Tenant members can view tenant profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() AND (tenant_id IS NULL OR tenant_id = public.current_tenant_id()));

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND tenant_id IS NOT DISTINCT FROM public.current_tenant_id());

-- Direct client membership creation is not the invitation path. Invitations are
-- performed server-side after role/tenant authorization, so a browser cannot
-- manufacture memberships or roles for another workspace.
DROP POLICY IF EXISTS "Bootstrap own role or admin assigns roles" ON public.user_roles;
CREATE POLICY "Admin assigns roles in own tenant"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND public.has_role(auth.uid(), 'admin')
    AND user_id <> auth.uid()
  );
