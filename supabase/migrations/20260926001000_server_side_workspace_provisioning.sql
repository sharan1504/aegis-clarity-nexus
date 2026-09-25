-- Server-side workspace provisioning for first-time authenticated users.
-- This migration intentionally does not weaken tenant/profile/role RLS.
-- The provisioning function is callable only by the trusted service role.

CREATE OR REPLACE FUNCTION public.provision_personal_workspace(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
  v_email text;
  v_full_name text;
  v_domain text;
  v_name text;
  v_slug text;
  v_role public.app_role;
  v_roles jsonb;
  v_created boolean := false;
  v_via text := 'existing';
  v_role_tenant_id uuid;
  v_role_tenant_count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Workspace provisioning is restricted to trusted server-side callers'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('cenops:workspace:' || p_user_id::text, 0));

  SELECT u.email, COALESCE(
    NULLIF(u.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(u.raw_user_meta_data ->> 'name', '')
  )
  INTO v_email, v_full_name
  FROM auth.users u
  WHERE u.id = p_user_id;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'Authenticated user does not exist'
      USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (p_user_id, v_email, v_full_name)
  ON CONFLICT (id) DO NOTHING;

  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_profile.tenant_id IS NOT NULL THEN
    SELECT * INTO v_tenant
    FROM public.tenants
    WHERE id = v_profile.tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profile references a missing workspace'
        USING ERRCODE = '23503';
    END IF;

    SELECT jsonb_agg(ur.role::text ORDER BY
      CASE ur.role WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'analyst' THEN 3 ELSE 4 END
    ), (array_agg(ur.role ORDER BY
      CASE ur.role WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'analyst' THEN 3 ELSE 4 END
    ))[1]
    INTO v_roles, v_role
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id AND ur.tenant_id = v_profile.tenant_id;

    IF v_role IS NULL THEN
      RAISE EXCEPTION 'Workspace membership exists without a workspace role'
        USING ERRCODE = '23514';
    END IF;

    RETURN jsonb_build_object(
      'tenantId', v_tenant.id,
      'tenantName', v_tenant.name,
      'primaryDomain', v_tenant.primary_domain,
      'roles', COALESCE(v_roles, '[]'::jsonb),
      'role', v_role::text,
      'environmentMode', v_tenant.environment_mode::text,
      'created', false,
      'via', 'existing'
    );
  END IF;

  SELECT count(DISTINCT ur.tenant_id), min(ur.tenant_id)
  INTO v_role_tenant_count, v_role_tenant_id
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id;

  IF v_role_tenant_count > 1 THEN
    RAISE EXCEPTION 'User has memberships in multiple workspaces but no active profile workspace'
      USING ERRCODE = '23514';
  END IF;

  IF v_role_tenant_count = 1 THEN
    SELECT * INTO v_tenant
    FROM public.tenants
    WHERE id = v_role_tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Existing workspace membership references a missing workspace'
        USING ERRCODE = '23503';
    END IF;

    UPDATE public.profiles
    SET tenant_id = v_tenant.id,
        email = COALESCE(email, v_email),
        full_name = COALESCE(full_name, v_full_name)
    WHERE id = p_user_id;

    SELECT jsonb_agg(ur.role::text ORDER BY
      CASE ur.role WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'analyst' THEN 3 ELSE 4 END
    ), (array_agg(ur.role ORDER BY
      CASE ur.role WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'analyst' THEN 3 ELSE 4 END
    ))[1]
    INTO v_roles, v_role
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id AND ur.tenant_id = v_tenant.id;

    RETURN jsonb_build_object(
      'tenantId', v_tenant.id,
      'tenantName', v_tenant.name,
      'primaryDomain', v_tenant.primary_domain,
      'roles', COALESCE(v_roles, '[]'::jsonb),
      'role', v_role::text,
      'environmentMode', v_tenant.environment_mode::text,
      'created', false,
      'via', 'existing'
    );
  END IF;

  v_domain := lower(COALESCE(NULLIF(split_part(v_email, '@', 2), ''), 'workspace'));
  v_name := initcap(split_part(split_part(v_domain, '.', 1), '-', 1));
  IF v_name IS NULL OR v_name = '' THEN v_name := 'Workspace'; END IF;

  v_slug := regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  IF v_slug = '' THEN v_slug := 'workspace'; END IF;
  v_slug := v_slug || '-' || left(replace(p_user_id::text, '-', ''), 8);

  INSERT INTO public.tenants (name, slug, primary_domain, environment_mode, created_by)
  VALUES (v_name, v_slug, NULLIF(v_domain, 'workspace'), 'live'::public.environment_mode, p_user_id)
  ON CONFLICT (slug) DO NOTHING
  RETURNING * INTO v_tenant;

  IF v_tenant.id IS NULL THEN
    SELECT * INTO v_tenant FROM public.tenants WHERE slug = v_slug;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Workspace provisioning could not resolve the created workspace'
        USING ERRCODE = '23505';
    END IF;
  ELSE
    v_created := true;
    v_via := 'provisioned';
  END IF;

  UPDATE public.profiles
  SET tenant_id = v_tenant.id,
      email = COALESCE(email, v_email),
      full_name = COALESCE(full_name, v_full_name)
  WHERE id = p_user_id;

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (p_user_id, v_tenant.id, 'admin'::public.app_role)
  ON CONFLICT (user_id, tenant_id, role) DO NOTHING;

  SELECT jsonb_agg(ur.role::text ORDER BY
    CASE ur.role WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'analyst' THEN 3 ELSE 4 END
  ), (array_agg(ur.role ORDER BY
    CASE ur.role WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'analyst' THEN 3 ELSE 4 END
  ))[1]
  INTO v_roles, v_role
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id AND ur.tenant_id = v_tenant.id;

  RETURN jsonb_build_object(
    'tenantId', v_tenant.id,
    'tenantName', v_tenant.name,
    'primaryDomain', v_tenant.primary_domain,
    'roles', COALESCE(v_roles, '[]'::jsonb),
    'role', v_role::text,
    'environmentMode', v_tenant.environment_mode::text,
    'created', v_created,
    'via', v_via
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.provision_personal_workspace(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_personal_workspace(uuid) TO service_role;

COMMENT ON FUNCTION public.provision_personal_workspace(uuid) IS
  'Trusted, idempotent first-login workspace provisioning. Callable only by service_role; does not weaken tenant/profile/role RLS.';
