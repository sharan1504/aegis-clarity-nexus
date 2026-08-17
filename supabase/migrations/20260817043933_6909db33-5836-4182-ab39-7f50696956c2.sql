-- 1. Fix the guardrail visibility policies: they called public.current_tenant_id(),
--    which authenticated may no longer execute, so any query touching a
--    platform-baseline row failed with a function permission error.
CREATE OR REPLACE FUNCTION app_private.has_tenant()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.tenant_id IS NOT NULL
  )
$$;

REVOKE ALL ON FUNCTION app_private.has_tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.has_tenant() TO authenticated, service_role;

DROP POLICY IF EXISTS "guardrails_select" ON public.guardrails;
CREATE POLICY "guardrails_select" ON public.guardrails
FOR SELECT TO authenticated
USING (
  (tenant_id IS NOT NULL AND app_private.is_tenant_member(tenant_id))
  OR (tenant_id IS NULL AND is_system = true AND app_private.has_tenant())
);

DROP POLICY IF EXISTS "guardrail_revisions_select" ON public.guardrail_revisions;
CREATE POLICY "guardrail_revisions_select" ON public.guardrail_revisions
FOR SELECT TO authenticated
USING (
  (tenant_id IS NOT NULL AND app_private.is_tenant_member(tenant_id))
  OR (
    tenant_id IS NULL AND app_private.has_tenant() AND EXISTS (
      SELECT 1 FROM public.guardrails g
      WHERE g.id = guardrail_revisions.guardrail_id
        AND g.tenant_id IS NULL
        AND g.is_system = true
    )
  )
);

-- 2. Audit log must accept instruction entities.
CREATE OR REPLACE FUNCTION public.audit_log_force_actor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.email INTO v_email FROM public.profiles p WHERE p.id = v_uid;
  SELECT ur.role::text INTO v_role FROM public.user_roles ur
    WHERE ur.user_id = v_uid
    ORDER BY CASE ur.role::text
      WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'analyst' THEN 3 ELSE 4 END
    LIMIT 1;

  NEW.actor_id := v_uid;
  NEW.actor_email := COALESCE(v_email, NEW.actor_email);
  NEW.actor_role := COALESCE(v_role, 'viewer');

  IF NEW.action !~ '^[a-z0-9_]+\.[a-z0-9_.]+$' OR length(NEW.action) > 64 THEN
    RAISE EXCEPTION 'invalid audit action: %', NEW.action;
  END IF;
  IF NEW.entity_type NOT IN ('change_record','change_approval','approval','report','ticket','notification','integration','user','tenant','agent','system','guardrail','instruction','policy') THEN
    RAISE EXCEPTION 'invalid audit entity_type: %', NEW.entity_type;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Organization instructions: behavioural guidance, NOT a security control.
CREATE TABLE public.organization_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  instruction_text text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  scope text NOT NULL DEFAULT 'organization',
  scope_id text,
  priority integer NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_instructions_scope_check
    CHECK (scope IN ('organization','agent','integration','capability')),
  CONSTRAINT organization_instructions_scope_id_check
    CHECK (scope = 'organization' OR scope_id IS NOT NULL)
);

CREATE INDEX organization_instructions_tenant_idx
  ON public.organization_instructions (tenant_id, scope, priority);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_instructions TO authenticated;
GRANT ALL ON public.organization_instructions TO service_role;
ALTER TABLE public.organization_instructions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organization_instructions_select" ON public.organization_instructions
FOR SELECT TO authenticated
USING (app_private.is_tenant_member(tenant_id));

CREATE POLICY "organization_instructions_insert" ON public.organization_instructions
FOR INSERT TO authenticated
WITH CHECK (
  app_private.is_tenant_member(tenant_id)
  AND app_private.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "organization_instructions_update" ON public.organization_instructions
FOR UPDATE TO authenticated
USING (
  app_private.is_tenant_member(tenant_id)
  AND app_private.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  app_private.is_tenant_member(tenant_id)
  AND app_private.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "organization_instructions_delete" ON public.organization_instructions
FOR DELETE TO authenticated
USING (
  app_private.is_tenant_member(tenant_id)
  AND app_private.has_role(auth.uid(), 'admin'::app_role)
);

CREATE TABLE public.organization_instruction_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instruction_id uuid NOT NULL REFERENCES public.organization_instructions(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version integer NOT NULL,
  name text NOT NULL,
  description text,
  instruction_text text NOT NULL,
  category text NOT NULL,
  scope text NOT NULL,
  scope_id text,
  priority integer NOT NULL,
  enabled boolean NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instruction_id, version)
);

GRANT SELECT ON public.organization_instruction_revisions TO authenticated;
GRANT ALL ON public.organization_instruction_revisions TO service_role;
ALTER TABLE public.organization_instruction_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organization_instruction_revisions_select"
ON public.organization_instruction_revisions
FOR SELECT TO authenticated
USING (app_private.is_tenant_member(tenant_id));

CREATE OR REPLACE FUNCTION public.instruction_version_bump()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.version := GREATEST(COALESCE(NEW.version, 1), 1);
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
    RETURN NEW;
  END IF;

  IF (NEW.name, NEW.description, NEW.instruction_text, NEW.category, NEW.scope,
      NEW.scope_id, NEW.priority, NEW.enabled)
     IS DISTINCT FROM
     (OLD.name, OLD.description, OLD.instruction_text, OLD.category, OLD.scope,
      OLD.scope_id, OLD.priority, OLD.enabled)
  THEN
    NEW.version := COALESCE(OLD.version, 1) + 1;
    NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  ELSE
    NEW.version := COALESCE(OLD.version, 1);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.instruction_record_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.organization_instruction_revisions (
    instruction_id, tenant_id, version, name, description, instruction_text,
    category, scope, scope_id, priority, enabled, changed_by
  ) VALUES (
    NEW.id, NEW.tenant_id, NEW.version, NEW.name, NEW.description, NEW.instruction_text,
    NEW.category, NEW.scope, NEW.scope_id, NEW.priority, NEW.enabled,
    COALESCE(auth.uid(), NEW.updated_by)
  )
  ON CONFLICT (instruction_id, version) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.instruction_revisions_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'instruction revisions are immutable';
END;
$$;

REVOKE ALL ON FUNCTION public.instruction_version_bump() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.instruction_record_revision() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.instruction_revisions_immutable() FROM PUBLIC;

CREATE TRIGGER instruction_version_bump_trg
BEFORE INSERT OR UPDATE ON public.organization_instructions
FOR EACH ROW EXECUTE FUNCTION public.instruction_version_bump();

CREATE TRIGGER instruction_record_revision_trg
AFTER INSERT OR UPDATE ON public.organization_instructions
FOR EACH ROW EXECUTE FUNCTION public.instruction_record_revision();

CREATE TRIGGER organization_instructions_updated_at
BEFORE UPDATE ON public.organization_instructions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER instruction_revisions_no_update
BEFORE UPDATE ON public.organization_instruction_revisions
FOR EACH ROW EXECUTE FUNCTION public.instruction_revisions_immutable();

CREATE TRIGGER instruction_revisions_no_delete
BEFORE DELETE ON public.organization_instruction_revisions
FOR EACH ROW EXECUTE FUNCTION public.instruction_revisions_immutable();

-- 4. Complete the platform baseline with the controls that were missing.
INSERT INTO public.guardrails
  (tenant_id, name, description, scope, scope_id, guardrail_type, enabled, priority,
   severity, enforcement_mode, conditions, action, message, is_system)
VALUES
  (NULL, 'Tenant isolation is absolute',
   'No agent, tool, workflow or connector may read, export or act on another workspace''s data.',
   'platform', NULL, 'block', true, 1, 'critical', 'enforce',
   '{"action_key_in":["cross_tenant_access","cross_tenant_read","cross_tenant_write","cross_tenant_export","tenant_impersonation"]}'::jsonb,
   '{"effect":"block"}'::jsonb,
   'Cross-workspace access is never permitted.', true),
  (NULL, 'Guardrails cannot be bypassed',
   'Attempts to disable, delete, downgrade or override governance are blocked outright.',
   'platform', NULL, 'block', true, 1, 'critical', 'enforce',
   '{"action_key_in":["guardrail_bypass","guardrail_disable","guardrail_delete","governance_override","policy_override","approval_override"]}'::jsonb,
   '{"effect":"block"}'::jsonb,
   'Governance controls cannot be bypassed or overridden.', true),
  (NULL, 'Sensitive authentication data cannot be returned',
   'Credentials, tokens and secrets are stripped from every response before it leaves the server.',
   'platform', NULL, 'deny_sensitive_data', true, 2, 'critical', 'enforce',
   '{"data_classification_in":["restricted","secret"]}'::jsonb,
   '{"effect":"block","redact_fields":["access_token","refresh_token","client_secret","client_id","api_key","apiKey","authorization","password","secret","private_key"]}'::jsonb,
   'Authentication material is never returned to a caller.', true),
  (NULL, 'Governance fails closed',
   'If guardrail evaluation or its supporting data is unavailable, write and destructive operations are denied rather than allowed.',
   'platform', NULL, 'block', true, 4, 'critical', 'enforce',
   '{"is_write":true,"freshness_in":["unavailable"]}'::jsonb,
   '{"effect":"block"}'::jsonb,
   'Governance could not be established, so the operation was denied.', true);