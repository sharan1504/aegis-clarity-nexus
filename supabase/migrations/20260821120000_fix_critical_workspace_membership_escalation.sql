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
--
-- Existing admin assignment remains available through the separate admin-only
-- INSERT policy below. Self-bootstrap is limited to the user's current tenant
-- and viewer role, and only when the user has no role there yet.
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

-- Keep the previously-added self-escalation protection explicit and defensive.
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
-- 3. Revision history: revisions are append-only and created exclusively by
--    SECURITY DEFINER database triggers. Authenticated users must not be able
--    to forge, modify, or delete historical records.
--
-- Explicit DENY-by-absence is intentional: no authenticated write policy is
-- created. The trigger functions are the controlled write path.
-- -----------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.guardrail_revisions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.organization_instruction_revisions FROM authenticated;

-- Keep trigger-owned history writable by the function owner while preventing
-- direct Data API writes. These statements are idempotent.
REVOKE ALL ON FUNCTION public.guardrail_record_revision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.instruction_record_revision() FROM PUBLIC, anon, authenticated;

-- Ensure the immutable history triggers cannot be bypassed by normal clients.
REVOKE UPDATE, DELETE ON public.guardrail_revisions FROM authenticated;
REVOKE UPDATE, DELETE ON public.organization_instruction_revisions FROM authenticated;
