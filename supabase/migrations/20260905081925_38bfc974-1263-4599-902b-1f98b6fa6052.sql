-- Ownership marker so a workspace can only be claimed by whoever created it.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS created_by uuid;

UPDATE public.tenants t
SET created_by = sub.user_id
FROM (
  SELECT DISTINCT ON (ur.tenant_id) ur.tenant_id, ur.user_id
  FROM public.user_roles ur
  WHERE ur.role = 'admin'
  ORDER BY ur.tenant_id, ur.created_at
) sub
WHERE sub.tenant_id = t.id AND t.created_by IS NULL;

ALTER TABLE public.tenants ALTER COLUMN created_by SET DEFAULT auth.uid();

-- Claiming a workspace now requires: it exists, the caller created it,
-- it has no other members and no roles at all.
CREATE OR REPLACE FUNCTION app_private.can_claim_tenant(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND _tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = _tenant_id AND t.created_by = auth.uid()
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.tenant_id = _tenant_id AND p.id <> auth.uid()
    )
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.tenant_id = _tenant_id)
$function$;

-- First-time role bootstrap is limited to a single 'admin' grant in a
-- workspace the caller created, and only when the caller holds no role yet.
CREATE OR REPLACE FUNCTION app_private.can_bootstrap_role(_tenant_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND _tenant_id IS NOT NULL
    AND _role = 'admin'::public.app_role
    AND EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = _tenant_id AND t.created_by = auth.uid()
    )
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.tenant_id = _tenant_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.tenant_id = _tenant_id AND p.id <> auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.tenant_id = _tenant_id
    )
$function$;

REVOKE ALL ON FUNCTION app_private.can_claim_tenant(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.can_bootstrap_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Bootstrap own role or admin assigns roles" ON public.user_roles;
CREATE POLICY "Bootstrap own role or admin assigns roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  (app_private.is_tenant_member(tenant_id) AND app_private.has_role(auth.uid(), 'admin'::app_role))
  OR (user_id = auth.uid() AND app_private.can_bootstrap_role(tenant_id, role))
);

DROP FUNCTION IF EXISTS app_private.can_bootstrap_role(uuid);
