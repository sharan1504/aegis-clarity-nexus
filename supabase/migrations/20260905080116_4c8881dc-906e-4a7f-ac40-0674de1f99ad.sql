-- 1. Genuine first-time tenant claim helper
CREATE OR REPLACE FUNCTION app_private.can_claim_tenant(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT auth.uid() IS NOT NULL
    AND _tenant_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = _tenant_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.tenant_id = _tenant_id AND p.id <> auth.uid()
    )
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.tenant_id = _tenant_id)
$$;

REVOKE ALL ON FUNCTION app_private.can_claim_tenant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.can_claim_tenant(uuid) FROM anon;
REVOKE ALL ON FUNCTION app_private.can_claim_tenant(uuid) FROM authenticated;

-- 2. Block users from moving their profile between tenants
CREATE OR REPLACE FUNCTION public.enforce_profile_tenant_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF current_setting('role', true) IN ('service_role', 'postgres') OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.tenant_id IS NOT NULL AND NOT app_private.can_claim_tenant(NEW.tenant_id) THEN
      RAISE EXCEPTION 'Workspace membership must be assigned by a workspace administrator';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    IF OLD.tenant_id IS NOT NULL THEN
      RAISE EXCEPTION 'Workspace membership cannot be changed';
    END IF;
    IF NEW.tenant_id IS NOT NULL AND NOT app_private.can_claim_tenant(NEW.tenant_id) THEN
      RAISE EXCEPTION 'Workspace membership must be assigned by a workspace administrator';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_tenant_immutability ON public.profiles;
CREATE TRIGGER enforce_profile_tenant_immutability
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_tenant_immutability();

-- 3. Tighten RLS on profiles as defense in depth
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (
  id = auth.uid()
  AND (tenant_id IS NULL OR app_private.can_claim_tenant(tenant_id))
);

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

-- 4. Restrict self-bootstrap of roles to a genuinely empty tenant
CREATE OR REPLACE FUNCTION app_private.can_bootstrap_role(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT auth.uid() IS NOT NULL
    AND _tenant_id IS NOT NULL
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
$$;

REVOKE ALL ON FUNCTION app_private.can_bootstrap_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.can_bootstrap_role(uuid) FROM anon;
REVOKE ALL ON FUNCTION app_private.can_bootstrap_role(uuid) FROM authenticated;

-- 5. Block self-escalation of an existing membership via the bootstrap branch
DROP POLICY IF EXISTS "Bootstrap own role or admin assigns roles" ON public.user_roles;
CREATE POLICY "Bootstrap own role or admin assigns roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  (app_private.is_tenant_member(tenant_id) AND app_private.has_role(auth.uid(), 'admin'::app_role))
  OR (user_id = auth.uid() AND app_private.can_bootstrap_role(tenant_id))
);