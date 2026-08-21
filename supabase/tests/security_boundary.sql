-- RLS regression suite for the 2026-08-21 workspace-membership lockdown.
-- Run with a Supabase/Postgres role that can SET ROLE authenticated and with
-- at least two tenant fixtures plus an analyst in one tenant and a member in
-- another. Every mutation is wrapped in a transaction and rolled back.

BEGIN;

DO $$
DECLARE
  v_actor uuid;
  v_actor_tenant uuid;
  v_target_user uuid;
  v_target_tenant uuid;
  v_other_member uuid;
  v_other_tenant uuid;
  v_row_id uuid;
  v_claims jsonb;
  v_failed boolean;
  v_rows integer;
BEGIN
  SELECT ur.user_id, ur.tenant_id INTO v_actor, v_actor_tenant
  FROM public.user_roles ur
  WHERE ur.role = 'analyst'
  ORDER BY ur.created_at LIMIT 1;

  SELECT p.id, p.tenant_id INTO v_target_user, v_target_tenant
  FROM public.profiles p
  WHERE p.tenant_id IS NOT NULL AND p.tenant_id <> v_actor_tenant
  ORDER BY p.created_at LIMIT 1;

  SELECT ur.user_id, ur.tenant_id INTO v_other_member, v_other_tenant
  FROM public.user_roles ur
  WHERE ur.tenant_id = v_actor_tenant AND ur.user_id <> v_actor
  ORDER BY ur.created_at LIMIT 1;

  IF v_actor IS NULL OR v_actor_tenant IS NULL OR v_target_user IS NULL OR v_target_tenant IS NULL OR v_other_member IS NULL THEN
    RAISE EXCEPTION 'security regression suite requires an analyst, a second tenant member, and a second tenant fixture';
  END IF;

  v_claims := jsonb_build_object('sub', v_actor::text, 'role', 'authenticated');
  PERFORM set_config('request.jwt.claims', v_claims::text, true);
  PERFORM set_config('request.jwt.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  -- 1. Self-assign admin in an arbitrary tenant must raise an RLS error.
  v_failed := false;
  BEGIN
    INSERT INTO public.user_roles(user_id, tenant_id, role) VALUES (v_actor, v_target_tenant, 'admin');
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAILED: self-assignment of admin role was permitted'; END IF;

  -- 2. Cross-tenant profile move must either raise or affect zero rows.
  v_failed := false;
  v_rows := 0;
  BEGIN
    UPDATE public.profiles SET tenant_id = v_actor_tenant WHERE id = v_target_user;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed AND v_rows <> 0 THEN RAISE EXCEPTION 'FAILED: cross-tenant profile move affected % row(s)', v_rows; END IF;

  -- 3. Non-admin cannot update another member's role.
  SELECT id INTO v_row_id FROM public.user_roles
  WHERE user_id = v_other_member AND tenant_id = v_other_tenant LIMIT 1;
  IF v_row_id IS NOT NULL THEN
    v_failed := false;
    v_rows := 0;
    BEGIN
      UPDATE public.user_roles SET role = 'admin' WHERE id = v_row_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN v_failed := true;
    END;
    IF NOT v_failed AND v_rows <> 0 THEN RAISE EXCEPTION 'FAILED: non-admin role update affected % row(s)', v_rows; END IF;
  END IF;

  -- 4. Non-admin cannot insert a role for another user.
  v_failed := false;
  BEGIN
    INSERT INTO public.user_roles(user_id, tenant_id, role) VALUES (v_other_member, v_actor_tenant, 'viewer');
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAILED: non-admin role insertion for another user was permitted'; END IF;

  -- 5. Append-only guardrail revisions reject INSERT/UPDATE/DELETE.
  v_failed := false;
  BEGIN
    INSERT INTO public.guardrail_revisions(guardrail_id, tenant_id, version, name, scope, guardrail_type, enabled, priority, severity, enforcement_mode, conditions, action)
    SELECT id, tenant_id, version + 1000, name, scope, guardrail_type, enabled, priority, severity, enforcement_mode, conditions, action
    FROM public.guardrails WHERE tenant_id = v_actor_tenant LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAILED: direct authenticated INSERT into guardrail_revisions was permitted'; END IF;

  SELECT id INTO v_row_id FROM public.guardrail_revisions WHERE tenant_id = v_actor_tenant LIMIT 1;
  IF v_row_id IS NOT NULL THEN
    v_failed := false;
    v_rows := 0;
    BEGIN UPDATE public.guardrail_revisions SET reason = 'tamper-test' WHERE id = v_row_id; GET DIAGNOSTICS v_rows = ROW_COUNT; EXCEPTION WHEN OTHERS THEN v_failed := true; END;
    IF NOT v_failed AND v_rows <> 0 THEN RAISE EXCEPTION 'FAILED: direct authenticated UPDATE of guardrail_revisions affected % row(s)', v_rows; END IF;
    v_failed := false;
    v_rows := 0;
    BEGIN DELETE FROM public.guardrail_revisions WHERE id = v_row_id; GET DIAGNOSTICS v_rows = ROW_COUNT; EXCEPTION WHEN OTHERS THEN v_failed := true; END;
    IF NOT v_failed AND v_rows <> 0 THEN RAISE EXCEPTION 'FAILED: direct authenticated DELETE of guardrail_revisions affected % row(s)', v_rows; END IF;
  END IF;

  -- 6. Append-only organization instruction revisions reject INSERT/UPDATE/DELETE.
  v_failed := false;
  BEGIN
    INSERT INTO public.organization_instruction_revisions(instruction_id, tenant_id, version, name, instruction_text, category, scope, priority, enabled)
    SELECT id, tenant_id, version + 1000, name, instruction_text, category, scope, priority, enabled
    FROM public.organization_instructions WHERE tenant_id = v_actor_tenant LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAILED: direct authenticated INSERT into organization_instruction_revisions was permitted'; END IF;

  SELECT id INTO v_row_id FROM public.organization_instruction_revisions WHERE tenant_id = v_actor_tenant LIMIT 1;
  IF v_row_id IS NOT NULL THEN
    v_failed := false;
    v_rows := 0;
    BEGIN UPDATE public.organization_instruction_revisions SET name = name || ' tamper-test' WHERE id = v_row_id; GET DIAGNOSTICS v_rows = ROW_COUNT; EXCEPTION WHEN OTHERS THEN v_failed := true; END;
    IF NOT v_failed AND v_rows <> 0 THEN RAISE EXCEPTION 'FAILED: direct authenticated UPDATE of organization_instruction_revisions affected % row(s)', v_rows; END IF;
    v_failed := false;
    v_rows := 0;
    BEGIN DELETE FROM public.organization_instruction_revisions WHERE id = v_row_id; GET DIAGNOSTICS v_rows = ROW_COUNT; EXCEPTION WHEN OTHERS THEN v_failed := true; END;
    IF NOT v_failed AND v_rows <> 0 THEN RAISE EXCEPTION 'FAILED: direct authenticated DELETE of organization_instruction_revisions affected % row(s)', v_rows; END IF;
  END IF;
END $$;

ROLLBACK;
