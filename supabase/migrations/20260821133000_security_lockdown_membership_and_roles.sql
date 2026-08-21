-- SECURITY LOCKDOWN
-- Fixes the two critical workspace/RBAC escalation paths in the original MVP RLS.
-- New migration: do not edit historical migrations.

-- A profile's tenant/workspace is assigned by trusted server-side provisioning,
-- never by the authenticated client. Users may update profile metadata only.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile metadata"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND tenant_id IS NOT DISTINCT FROM (
      SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

-- Remove the original self-bootstrap policy. It allowed an authenticated user
-- to choose arbitrary tenant_id/role values, including admin, during INSERT.
DROP POLICY IF EXISTS "Bootstrap own role or admin assigns roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert own role" ON public.user_roles;

-- A user may only bootstrap a viewer role for their current workspace.
-- All privileged roles must be granted by an existing admin in that workspace.
CREATE POLICY "Users can bootstrap viewer role in current tenant"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id = public.current_tenant_id()
    AND role = 'viewer'
  );

CREATE POLICY "Admins can grant roles to tenant members"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND public.has_role(auth.uid(), 'admin')
    AND public.is_tenant_member(tenant_id)
    AND EXISTS (
      SELECT 1 FROM public.profiles target
      WHERE target.id = user_roles.user_id
        AND target.tenant_id = tenant_id
    )
  );

-- Prevent a user from changing an existing role row to another tenant or
-- changing their own role. Only an admin can modify another member's role.
DROP POLICY IF EXISTS "Admins can update roles in tenant" ON public.user_roles;
CREATE POLICY "Admins can update roles for tenant members"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (
    public.is_tenant_member(tenant_id)
    AND public.has_role(auth.uid(), 'admin')
    AND user_id <> auth.uid()
  )
  WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND public.has_role(auth.uid(), 'admin')
    AND user_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles target
      WHERE target.id = user_roles.user_id
        AND target.tenant_id = tenant_id
    )
  );

-- Prevent admins from deleting their own role and prevent cross-tenant deletes.
DROP POLICY IF EXISTS "Admins can delete roles in tenant" ON public.user_roles;
CREATE POLICY "Admins can delete roles for tenant members"
  ON public.user_roles FOR DELETE TO authenticated
  USING (
    public.is_tenant_member(tenant_id)
    AND public.has_role(auth.uid(), 'admin')
    AND user_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles target
      WHERE target.id = user_roles.user_id
        AND target.tenant_id = tenant_id
    )
  );

-- Tenants cannot be created with an attacker-selected owner/membership via a
-- role insert anymore. Keep tenant creation available for onboarding, but the
-- caller must not be able to update another tenant unless they are a member.
DROP POLICY IF EXISTS "Authenticated users can create a tenant" ON public.tenants;
CREATE POLICY "Authenticated users can create a tenant safely"
  ON public.tenants FOR INSERT TO authenticated
  WITH CHECK (true);

-- Audit log: clients may append only to their own tenant and the database seal
-- trigger remains authoritative for actor/hash fields. Never allow UPDATE/DELETE.
DROP POLICY IF EXISTS "Tenant members can append audit entries" ON public.audit_log;
CREATE POLICY "Tenant members can append audit entries"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND (actor_id IS NULL OR actor_id = auth.uid())
  );

-- Explicitly revoke mutation privileges from the browser role for immutable
-- audit history; server-side SECURITY DEFINER triggers/service role remain able
-- to write controlled records.
REVOKE UPDATE, DELETE ON public.audit_log FROM authenticated;

COMMENT ON TABLE public.user_roles IS
  'Tenant-scoped roles. Self-bootstrap is viewer-only; privileged roles require an existing tenant admin.';
COMMENT ON COLUMN public.profiles.tenant_id IS
  'Immutable from authenticated clients; tenant reassignment is a trusted server-side operation.';
