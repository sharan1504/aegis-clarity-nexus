-- CRITICAL SECURITY FIX
-- Prevent authenticated users from moving their own profile into another workspace
-- and from self-assigning privileged roles.

-- -----------------------------------------------------------------------------
-- 1. Profiles: tenant_id is server-controlled and immutable by the user.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile without changing tenant"
ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND tenant_id IS NOT DISTINCT FROM public.current_tenant_id()
);

-- -----------------------------------------------------------------------------
-- 2. Roles: remove the vulnerable self-bootstrap rule that allowed a user to
--    insert an admin role for themselves in an arbitrary tenant.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Bootstrap own role or admin assigns roles" ON public.user_roles;

CREATE POLICY "Admins can assign roles to tenant members"
ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (
  app_private.is_tenant_member(tenant_id)
  AND app_private.has_role(auth.uid(), 'admin'::app_role)
  AND user_id <> auth.uid()
);

CREATE POLICY "Users may bootstrap viewer role only"
ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role = 'viewer'::app_role
  AND tenant_id = public.current_tenant_id()
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles existing
    WHERE existing.user_id = auth.uid()
      AND existing.tenant_id = tenant_id
  )
);

DROP POLICY IF EXISTS "Admins can update roles in tenant" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles in tenant" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update other members roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete other members roles" ON public.user_roles;

CREATE POLICY "Admins can update other members roles"
ON public.user_roles
FOR UPDATE TO authenticated
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

CREATE POLICY "Admins can delete other members roles"
ON public.user_roles
FOR DELETE TO authenticated
USING (
  user_id <> auth.uid()
  AND app_private.is_tenant_member(tenant_id)
  AND app_private.has_role(auth.uid(), 'admin'::app_role)
);

-- -----------------------------------------------------------------------------
-- 3. Revision history is append-only and database-trigger owned.
--    Explicit deny policies make the intended write boundary visible to
--    security scanners while the SECURITY DEFINER triggers remain the only
--    supported write path.
-- -----------------------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE ON public.guardrail_revisions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.organization_instruction_revisions FROM authenticated;

DROP POLICY IF EXISTS "guardrail_revisions_deny_direct_insert" ON public.guardrail_revisions;
CREATE POLICY "guardrail_revisions_deny_direct_insert"
ON public.guardrail_revisions FOR INSERT TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS "guardrail_revisions_deny_direct_update" ON public.guardrail_revisions;
CREATE POLICY "guardrail_revisions_deny_direct_update"
ON public.guardrail_revisions FOR UPDATE TO authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "guardrail_revisions_deny_direct_delete" ON public.guardrail_revisions;
CREATE POLICY "guardrail_revisions_deny_direct_delete"
ON public.guardrail_revisions FOR DELETE TO authenticated
USING (false);

DROP POLICY IF EXISTS "organization_instruction_revisions_deny_direct_insert" ON public.organization_instruction_revisions;
CREATE POLICY "organization_instruction_revisions_deny_direct_insert"
ON public.organization_instruction_revisions FOR INSERT TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS "organization_instruction_revisions_deny_direct_update" ON public.organization_instruction_revisions;
CREATE POLICY "organization_instruction_revisions_deny_direct_update"
ON public.organization_instruction_revisions FOR UPDATE TO authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "organization_instruction_revisions_deny_direct_delete" ON public.organization_instruction_revisions;
CREATE POLICY "organization_instruction_revisions_deny_direct_delete"
ON public.organization_instruction_revisions FOR DELETE TO authenticated
USING (false);

REVOKE ALL ON FUNCTION public.guardrail_record_revision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.instruction_record_revision() FROM PUBLIC, anon, authenticated;
