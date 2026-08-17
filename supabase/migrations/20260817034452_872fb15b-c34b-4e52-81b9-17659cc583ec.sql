-- ============================================================================
-- GUARDRAILS: platform-wide governance control plane
-- ============================================================================

CREATE TYPE public.guardrail_scope AS ENUM (
  'platform','organization','environment','agent','integration','capability','tool'
);

CREATE TYPE public.guardrail_effect AS ENUM (
  'block','require_approval','require_confirmation','escalate','limit','require_change_ticket','allow'
);

CREATE TYPE public.guardrail_enforcement AS ENUM ('enforce','monitor');

CREATE TYPE public.guardrail_severity AS ENUM ('low','medium','high','critical');

CREATE TABLE public.guardrails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL tenant_id = platform-level guardrail (applies to every tenant)
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  scope public.guardrail_scope NOT NULL,
  -- agent_key / integration id / capability key / tool key / environment name
  scope_id text,
  guardrail_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  severity public.guardrail_severity NOT NULL DEFAULT 'high',
  enforcement_mode public.guardrail_enforcement NOT NULL DEFAULT 'enforce',
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  action jsonb NOT NULL DEFAULT '{}'::jsonb,
  message text,
  is_system boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guardrails_type_allowlist CHECK (guardrail_type IN (
    'block','require_approval','require_human_confirmation','require_escalation',
    'limit_records','limit_scope','require_confidence','require_fresh_data',
    'deny_sensitive_data','deny_production_action','require_change_ticket',
    'require_rollback_plan','require_audit','rate_limit','allowlist','denylist'
  )),
  CONSTRAINT guardrails_conditions_object CHECK (jsonb_typeof(conditions) = 'object'),
  CONSTRAINT guardrails_action_object CHECK (jsonb_typeof(action) = 'object'),
  CONSTRAINT guardrails_priority_range CHECK (priority BETWEEN 1 AND 1000),
  CONSTRAINT guardrails_platform_is_system CHECK (tenant_id IS NOT NULL OR is_system = true)
);

CREATE INDEX guardrails_lookup_idx ON public.guardrails (tenant_id, enabled, scope);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guardrails TO authenticated;
GRANT ALL ON public.guardrails TO service_role;
ALTER TABLE public.guardrails ENABLE ROW LEVEL SECURITY;

-- Tenant members read their own guardrails plus the platform baseline.
CREATE POLICY guardrails_select ON public.guardrails FOR SELECT TO authenticated
  USING (
    (tenant_id IS NOT NULL AND app_private.is_tenant_member(tenant_id))
    OR (tenant_id IS NULL AND public.current_tenant_id() IS NOT NULL)
  );

-- Only admins may author guardrails, and only for their own tenant. Platform
-- rows (tenant_id IS NULL) are never writable through the Data API.
CREATE POLICY guardrails_insert ON public.guardrails FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND app_private.is_tenant_member(tenant_id)
    AND app_private.has_role(auth.uid(),'admin')
    AND is_system = false
  );

CREATE POLICY guardrails_update ON public.guardrails FOR UPDATE TO authenticated
  USING (
    tenant_id IS NOT NULL AND is_system = false
    AND app_private.is_tenant_member(tenant_id)
    AND app_private.has_role(auth.uid(),'admin')
  )
  WITH CHECK (
    tenant_id IS NOT NULL AND is_system = false
    AND app_private.is_tenant_member(tenant_id)
    AND app_private.has_role(auth.uid(),'admin')
  );

CREATE POLICY guardrails_delete ON public.guardrails FOR DELETE TO authenticated
  USING (
    tenant_id IS NOT NULL AND is_system = false
    AND app_private.is_tenant_member(tenant_id)
    AND app_private.has_role(auth.uid(),'admin')
  );

CREATE TRIGGER guardrails_updated_at BEFORE UPDATE ON public.guardrails
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Immutable version history
-- ---------------------------------------------------------------------------
CREATE TABLE public.guardrail_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guardrail_id uuid NOT NULL REFERENCES public.guardrails(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  version integer NOT NULL,
  name text NOT NULL,
  scope public.guardrail_scope NOT NULL,
  scope_id text,
  guardrail_type text NOT NULL,
  enabled boolean NOT NULL,
  priority integer NOT NULL,
  severity public.guardrail_severity NOT NULL,
  enforcement_mode public.guardrail_enforcement NOT NULL,
  conditions jsonb NOT NULL,
  action jsonb NOT NULL,
  message text,
  reason text,
  changed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guardrail_id, version)
);

CREATE INDEX guardrail_revisions_lookup_idx ON public.guardrail_revisions (guardrail_id, version DESC);

GRANT SELECT ON public.guardrail_revisions TO authenticated;
GRANT ALL ON public.guardrail_revisions TO service_role;
ALTER TABLE public.guardrail_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY guardrail_revisions_select ON public.guardrail_revisions FOR SELECT TO authenticated
  USING (
    (tenant_id IS NOT NULL AND app_private.is_tenant_member(tenant_id))
    OR (tenant_id IS NULL AND public.current_tenant_id() IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.guardrail_version_bump()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.version := GREATEST(COALESCE(NEW.version,1),1);
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
    RETURN NEW;
  END IF;

  IF (NEW.name, NEW.scope, NEW.scope_id, NEW.guardrail_type, NEW.enabled, NEW.priority,
      NEW.severity, NEW.enforcement_mode, NEW.conditions, NEW.action, NEW.message)
     IS DISTINCT FROM
     (OLD.name, OLD.scope, OLD.scope_id, OLD.guardrail_type, OLD.enabled, OLD.priority,
      OLD.severity, OLD.enforcement_mode, OLD.conditions, OLD.action, OLD.message)
  THEN
    NEW.version := COALESCE(OLD.version,1) + 1;
    NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  ELSE
    NEW.version := COALESCE(OLD.version,1);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guardrail_record_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  INSERT INTO public.guardrail_revisions (
    guardrail_id, tenant_id, version, name, scope, scope_id, guardrail_type,
    enabled, priority, severity, enforcement_mode, conditions, action, message, changed_by
  ) VALUES (
    NEW.id, NEW.tenant_id, NEW.version, NEW.name, NEW.scope, NEW.scope_id, NEW.guardrail_type,
    NEW.enabled, NEW.priority, NEW.severity, NEW.enforcement_mode, NEW.conditions, NEW.action,
    NEW.message, COALESCE(auth.uid(), NEW.updated_by)
  )
  ON CONFLICT (guardrail_id, version) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guardrail_revisions_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'guardrail revisions are immutable';
END;
$$;

CREATE TRIGGER guardrail_version_bump_trg BEFORE INSERT OR UPDATE ON public.guardrails
  FOR EACH ROW EXECUTE FUNCTION public.guardrail_version_bump();

CREATE TRIGGER guardrail_record_revision_trg AFTER INSERT OR UPDATE ON public.guardrails
  FOR EACH ROW EXECUTE FUNCTION public.guardrail_record_revision();

CREATE TRIGGER guardrail_revisions_no_update BEFORE UPDATE ON public.guardrail_revisions
  FOR EACH ROW EXECUTE FUNCTION public.guardrail_revisions_immutable();

CREATE TRIGGER guardrail_revisions_no_delete BEFORE DELETE ON public.guardrail_revisions
  FOR EACH ROW EXECUTE FUNCTION public.guardrail_revisions_immutable();

-- ---------------------------------------------------------------------------
-- Guardrail evaluations (observability). Append-only.
-- ---------------------------------------------------------------------------
CREATE TABLE public.guardrail_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  agent_key text,
  integration_id uuid REFERENCES public.integrations(id) ON DELETE SET NULL,
  provider text,
  capability text,
  action_key text,
  environment text NOT NULL DEFAULT 'production',
  execution_class text,
  decision text NOT NULL,
  simulated boolean NOT NULL DEFAULT false,
  matched jsonb NOT NULL DEFAULT '[]'::jsonb,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_record_id uuid REFERENCES public.change_records(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guardrail_evaluations_decision_allowlist CHECK (
    decision IN ('allow','block','require_approval','require_confirmation','escalate','unavailable')
  )
);

CREATE INDEX guardrail_evaluations_tenant_idx ON public.guardrail_evaluations (tenant_id, created_at DESC);

GRANT SELECT, INSERT ON public.guardrail_evaluations TO authenticated;
GRANT ALL ON public.guardrail_evaluations TO service_role;
ALTER TABLE public.guardrail_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY guardrail_evaluations_select ON public.guardrail_evaluations FOR SELECT TO authenticated
  USING (app_private.is_tenant_member(tenant_id));

CREATE POLICY guardrail_evaluations_insert ON public.guardrail_evaluations FOR INSERT TO authenticated
  WITH CHECK (app_private.is_tenant_member(tenant_id) AND (user_id IS NULL OR user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Audit: allow guardrail entities in the sealed audit log
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_log_force_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
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
  IF NEW.entity_type NOT IN ('change_record','change_approval','approval','report','ticket','notification','integration','user','tenant','agent','system','guardrail') THEN
    RAISE EXCEPTION 'invalid audit entity_type: %', NEW.entity_type;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Platform baseline guardrails (immutable through the Data API)
-- ---------------------------------------------------------------------------
INSERT INTO public.guardrails
  (tenant_id, name, description, scope, scope_id, guardrail_type, enabled, priority, severity, enforcement_mode, conditions, action, message, is_system)
VALUES
  (NULL,'No credential or secret exposure','Agent and tool output may never contain access tokens, refresh tokens, client secrets or authorization codes.','platform',NULL,'deny_sensitive_data',true,1,'critical','enforce','{"data_classification":"secret"}','{"effect":"block"}','Platform guardrail: credentials and secrets can never be exposed.',true),
  (NULL,'Production destructive actions require approval','Any destructive action targeting a production environment requires an approved change before execution.','platform',NULL,'require_approval',true,5,'critical','enforce','{"environment":"production","execution_class_in":["destructive","high_risk"]}','{"effect":"require_approval"}','Platform guardrail: production destructive changes require approval.',true),
  (NULL,'Production changes require a change record','Production write operations must be attached to a change record.','platform',NULL,'require_change_ticket',true,10,'high','enforce','{"environment":"production","is_destructive":true,"has_change_ticket":false}','{"effect":"require_change_ticket"}','Platform guardrail: a change record is required for production changes.',true),
  (NULL,'Bulk changes above 20 records require approval','Operations affecting more than 20 records may not execute automatically.','platform',NULL,'limit_records',true,20,'high','enforce','{"affected_records_gt":20}','{"effect":"require_approval"}','Platform guardrail: more than 20 affected records requires approval.',true),
  (NULL,'Low-confidence recommendations require human review','Recommendations below 95% confidence require a human decision.','platform',NULL,'require_confidence',true,30,'medium','enforce','{"confidence_lt":95}','{"effect":"require_confirmation"}','Platform guardrail: confidence below 95% requires human review.',true),
  (NULL,'Stale data may not drive write actions','Write operations may not be based on data that has not been synchronized recently.','platform',NULL,'require_fresh_data',true,40,'high','enforce','{"freshness_in":["stale","unavailable"],"is_write":true}','{"effect":"block"}','Platform guardrail: refresh the data source before acting on it.',true),
  (NULL,'User deletion is blocked','Deleting user accounts through an agent is never permitted on this platform.','tool','delete_user','block',true,2,'critical','enforce','{"action_key":"delete_user"}','{"effect":"block"}','Platform guardrail: agent-initiated user deletion is blocked.',true),
  (NULL,'Destructive actions require a rollback plan','No destructive action may execute without a documented rollback plan.','platform',NULL,'require_rollback_plan',true,50,'high','enforce','{"is_destructive":true,"has_rollback_plan":false}','{"effect":"block"}','Platform guardrail: a rollback plan is required for destructive actions.',true),
  (NULL,'Agents may not read credential stores','Agents may never read integration credentials or OAuth state.','capability','credential_access','deny_sensitive_data',true,3,'critical','enforce','{"data_classification":"secret"}','{"effect":"block"}','Platform guardrail: credential stores are not agent-accessible.',true);
