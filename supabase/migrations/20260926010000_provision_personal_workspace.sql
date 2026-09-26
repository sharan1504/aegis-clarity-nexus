-- Trusted, idempotent workspace bootstrap. Browser roles cannot execute this function.
CREATE OR REPLACE FUNCTION public.provision_personal_workspace(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
  v_full_name text;
  v_profile_tenant uuid;
  v_membership_tenant uuid;
  v_membership_count integer;
  v_tenant public.tenants%ROWTYPE;
  v_roles text[];
  v_domain text;
  v_name text;
  v_slug text;
BEGIN
  IF auth.role() <> 'service_role' OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Workspace provisioning is restricted to trusted server-side callers' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cenops:workspace:' || p_user_id::text, 918273));

  SELECT u.email, NULLIF(u.raw_user_meta_data ->> 'full_name', '')
    INTO v_email, v_full_name FROM auth.users AS u WHERE u.id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Authenticated user does not exist'; END IF;

  INSERT INTO public.profiles (id, email, full_name) VALUES (p_user_id, v_email, v_full_name)
    ON CONFLICT (id) DO UPDATE SET email = COALESCE(public.profiles.email, EXCLUDED.email),
      full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);

  SELECT p.tenant_id INTO v_profile_tenant FROM public.profiles AS p
    WHERE p.id = p_user_id FOR UPDATE;

  IF v_profile_tenant IS NOT NULL THEN
    SELECT t.* INTO STRICT v_tenant FROM public.tenants AS t WHERE t.id = v_profile_tenant;
    SELECT COALESCE(pg_catalog.array_agg(ur.role::text ORDER BY
      CASE ur.role WHEN 'admin'::public.app_role THEN 1 WHEN 'manager'::public.app_role THEN 2
        WHEN 'analyst'::public.app_role THEN 3 ELSE 4 END), ARRAY[]::text[]) INTO v_roles
      FROM public.user_roles AS ur WHERE ur.user_id = p_user_id AND ur.tenant_id = v_profile_tenant;
    IF COALESCE(pg_catalog.array_length(v_roles, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Workspace membership exists without a workspace role' USING ERRCODE = '23514';
    END IF;
    RETURN pg_catalog.jsonb_build_object('tenantId', v_tenant.id, 'tenantName', v_tenant.name,
      'primaryDomain', v_tenant.primary_domain, 'roles', v_roles, 'role', v_roles[1],
      'environmentMode', v_tenant.environment_mode, 'created', false, 'via', 'existing');
  END IF;

  SELECT count(DISTINCT ur.tenant_id), (pg_catalog.array_agg(DISTINCT ur.tenant_id))[1] INTO v_membership_count, v_membership_tenant
    FROM public.user_roles AS ur WHERE ur.user_id = p_user_id;
  IF v_membership_count > 1 THEN
    RAISE EXCEPTION 'User has memberships in multiple workspaces but no active profile workspace' USING ERRCODE = '23514';
  END IF;

  IF v_membership_count = 1 THEN
    SELECT t.* INTO STRICT v_tenant FROM public.tenants AS t WHERE t.id = v_membership_tenant;
    UPDATE public.profiles SET tenant_id = v_tenant.id WHERE id = p_user_id;
    SELECT COALESCE(pg_catalog.array_agg(ur.role::text ORDER BY
      CASE ur.role WHEN 'admin'::public.app_role THEN 1 WHEN 'manager'::public.app_role THEN 2
        WHEN 'analyst'::public.app_role THEN 3 ELSE 4 END), ARRAY[]::text[]) INTO v_roles
      FROM public.user_roles AS ur WHERE ur.user_id = p_user_id AND ur.tenant_id = v_tenant.id;
    RETURN pg_catalog.jsonb_build_object('tenantId', v_tenant.id, 'tenantName', v_tenant.name,
      'primaryDomain', v_tenant.primary_domain, 'roles', v_roles, 'role', v_roles[1],
      'environmentMode', v_tenant.environment_mode, 'created', false, 'via', 'existing');
  END IF;

  v_domain := lower(COALESCE(NULLIF(split_part(v_email, '@', 2), ''), 'workspace'));
  v_name := initcap(split_part(split_part(v_domain, '.', 1), '-', 1));
  IF v_name IS NULL OR v_name = '' THEN v_name := 'Workspace'; END IF;
  v_slug := pg_catalog.regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g');
  v_slug := btrim(v_slug, '-');
  IF v_slug = '' THEN v_slug := 'workspace'; END IF;
  v_slug := v_slug || '-' || left(replace(p_user_id::text, '-', ''), 8);

  INSERT INTO public.tenants (name, slug, primary_domain, environment_mode, created_by)
    VALUES (v_name, v_slug, NULLIF(v_domain, 'workspace'), 'demo'::public.environment_mode, p_user_id)
    ON CONFLICT (slug) DO NOTHING RETURNING * INTO v_tenant;
  IF v_tenant.id IS NULL THEN
    SELECT t.* INTO STRICT v_tenant FROM public.tenants AS t WHERE t.slug = v_slug;
  END IF;

  UPDATE public.profiles SET tenant_id = v_tenant.id WHERE id = p_user_id;
  INSERT INTO public.user_roles (user_id, tenant_id, role)
    VALUES (p_user_id, v_tenant.id, 'admin'::public.app_role)
    ON CONFLICT (user_id, tenant_id, role) DO NOTHING;

  SELECT COALESCE(pg_catalog.array_agg(ur.role::text ORDER BY
    CASE ur.role WHEN 'admin'::public.app_role THEN 1 WHEN 'manager'::public.app_role THEN 2
      WHEN 'analyst'::public.app_role THEN 3 ELSE 4 END), ARRAY[]::text[]) INTO v_roles
    FROM public.user_roles AS ur WHERE ur.user_id = p_user_id AND ur.tenant_id = v_tenant.id;

  RETURN pg_catalog.jsonb_build_object('tenantId', v_tenant.id, 'tenantName', v_tenant.name,
    'primaryDomain', v_tenant.primary_domain, 'roles', v_roles, 'role', v_roles[1],
    'environmentMode', v_tenant.environment_mode, 'created', true, 'via', 'provisioned');
END;
$$;

REVOKE ALL ON FUNCTION public.provision_personal_workspace(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_personal_workspace(uuid) TO service_role;
