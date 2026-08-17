-- Policy versioning + auditable policy history for agent<->integration bindings.
ALTER TABLE public.agent_integration_bindings
  ADD COLUMN IF NOT EXISTS policy_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS policy_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS policy_updated_by uuid REFERENCES auth.users(id);

ALTER TABLE public.agent_integration_bindings
  ADD CONSTRAINT agent_integration_bindings_policy_version_positive
  CHECK (policy_version >= 1);

CREATE TABLE IF NOT EXISTS public.agent_policy_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  binding_id uuid NOT NULL REFERENCES public.agent_integration_bindings(id) ON DELETE CASCADE,
  agent_key text NOT NULL REFERENCES public.agent_definitions(agent_key),
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  capability_id uuid NOT NULL REFERENCES public.capabilities(id),
  policy_version integer NOT NULL,
  policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (binding_id, policy_version)
);

GRANT SELECT ON public.agent_policy_revisions TO authenticated;
GRANT ALL ON public.agent_policy_revisions TO service_role;

ALTER TABLE public.agent_policy_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view policy revisions"
  ON public.agent_policy_revisions FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

CREATE INDEX IF NOT EXISTS agent_policy_revisions_binding_idx
  ON public.agent_policy_revisions (binding_id, policy_version DESC);

-- Bump the policy version and record a revision whenever the policy JSON changes.
CREATE OR REPLACE FUNCTION public.agent_binding_policy_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.policy_version := GREATEST(COALESCE(NEW.policy_version, 1), 1);
    NEW.policy_updated_at := now();
    NEW.policy_updated_by := COALESCE(auth.uid(), NEW.policy_updated_by);
    RETURN NEW;
  END IF;

  IF NEW.policy IS DISTINCT FROM OLD.policy THEN
    NEW.policy_version := COALESCE(OLD.policy_version, 1) + 1;
    NEW.policy_updated_at := now();
    NEW.policy_updated_by := COALESCE(auth.uid(), NEW.policy_updated_by);
  ELSE
    NEW.policy_version := COALESCE(OLD.policy_version, 1);
    NEW.policy_updated_at := OLD.policy_updated_at;
    NEW.policy_updated_by := OLD.policy_updated_by;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_binding_policy_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.policy IS NOT DISTINCT FROM OLD.policy THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.agent_policy_revisions (
    tenant_id, binding_id, agent_key, integration_id, capability_id,
    policy_version, policy, changed_by
  ) VALUES (
    NEW.tenant_id, NEW.id, NEW.agent_key, NEW.integration_id, NEW.capability_id,
    NEW.policy_version, NEW.policy, COALESCE(auth.uid(), NEW.policy_updated_by)
  )
  ON CONFLICT (binding_id, policy_version) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_binding_policy_version_trg ON public.agent_integration_bindings;
CREATE TRIGGER agent_binding_policy_version_trg
  BEFORE INSERT OR UPDATE ON public.agent_integration_bindings
  FOR EACH ROW EXECUTE FUNCTION public.agent_binding_policy_version();

DROP TRIGGER IF EXISTS agent_binding_policy_revision_trg ON public.agent_integration_bindings;
CREATE TRIGGER agent_binding_policy_revision_trg
  AFTER INSERT OR UPDATE ON public.agent_integration_bindings
  FOR EACH ROW EXECUTE FUNCTION public.agent_binding_policy_revision();

REVOKE ALL ON FUNCTION public.agent_binding_policy_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_binding_policy_revision() FROM PUBLIC, anon, authenticated;