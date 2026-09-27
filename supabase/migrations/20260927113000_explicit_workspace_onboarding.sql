-- Workspace creation is an explicit post-auth onboarding step.
-- New workspaces start in Live mode; Demo remains an admin-selectable workspace mode.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS description text;

CREATE OR REPLACE FUNCTION public.create_workspace_for_user(
  p_user_id uuid,
  p_name text,
  p_description text,
  p_role public.app_role
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
  v_full_name text;
  v_existing_tenant uuid;
  v_membership_count integer;
  v_tenant public.tenants%ROWTYPE;
  v_slug text;
  v_base_slug text;
  v_description text;
BEGIN
  IF auth.role() <> 'service_role' OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Workspace creation is restricted to trusted server-side callers' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cenops:create-workspace:' || p_user_id::text, 918274)
  );

  IF p_name IS NULL OR length(btrim(p_name)) < 2 OR length(btrim(p_name)) > 80 THEN
    RAISE EXCEPTION 'Workspace name must be between 2 and 80 characters' USING ERRCODE = '22023';
  END IF;

  v_description := NULLIF(left(btrim(COALESCE(p_description, '')), 500), '');

  SELECT u.email, NULLIF(u.raw_user_meta_data ->> 'full_name', '')
    INTO v_email, v_full_name
  FROM auth.users AS u
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated user does not exist' USING ERRCODE = '22023';
  END IF;

  SELECT p.tenant_id INTO v_existing_tenant
  FROM public.profiles AS p
  WHERE p.id = p_user_id
  FOR UPDATE;

  SELECT count(DISTINCT ur.tenant_id)
    INTO v_membership_count
  FROM public.user_roles AS ur
  WHERE ur.user_id = p_user_id;

  IF v_existing_tenant IS NOT NULL OR v_membership_count > 0 THEN
    RAISE EXCEPTION 'Your account is already attached to a workspace' USING ERRCODE = '23514';
  END IF;

  v_base_slug := pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g'),
    '(^-+|-+$)', '', 'g'
  );
  IF v_base_slug = '' THEN
    v_base_slug := 'workspace';
  END IF;
  v_slug := left(v_base_slug, 70) || '-' || left(replace(p_user_id::text, '-', ''), 8);

  INSERT INTO public.tenants (
    name, slug, description, primary_domain, environment_mode, created_by
  )
  VALUES (
    btrim(p_name),
    v_slug,
    v_description,
    NULLIF(lower(NULLIF(split_part(COALESCE(v_email, ''), '@', 2), '')), ''),
    'live'::public.environment_mode,
    p_user_id
  )
  RETURNING * INTO v_tenant;

  INSERT INTO public.profiles (id, email, full_name, tenant_id)
  VALUES (p_user_id, v_email, v_full_name, v_tenant.id)
  ON CONFLICT (id) DO UPDATE
    SET email = COALESCE(public.profiles.email, EXCLUDED.email),
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        tenant_id = EXCLUDED.tenant_id;

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (p_user_id, v_tenant.id, p_role);

  RETURN pg_catalog.jsonb_build_object(
    'tenantId', v_tenant.id,
    'tenantName', v_tenant.name,
    'description', v_tenant.description,
    'primaryDomain', v_tenant.primary_domain,
    'roles', pg_catalog.jsonb_build_array(p_role::text),
    'role', p_role::text,
    'environmentMode', v_tenant.environment_mode,
    'created', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_workspace_for_user(uuid, text, text, public.app_role)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_workspace_for_user(uuid, text, text, public.app_role)
  TO service_role;

COMMENT ON COLUMN public.tenants.description IS
  'Optional workspace description supplied during explicit workspace onboarding.';
