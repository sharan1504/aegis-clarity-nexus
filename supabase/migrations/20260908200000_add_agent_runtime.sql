-- Durable execution state for governed Aegis agent runs.
-- The runtime stores state; it does not grant execution permission. Existing
-- capability routing, policy evaluation, approval and audit boundaries remain
-- authoritative for every external action.

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_key text NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN (
    'planned','running','waiting_approval','paused','completed','failed','cancelled'
  )),
  current_step text NOT NULL DEFAULT 'plan' CHECK (current_step IN (
    'plan','investigate','policy','approval','execute','verify'
  )),
  input text NOT NULL,
  plan jsonb,
  policy_verdict jsonb,
  approval jsonb,
  execution jsonb,
  verification jsonb,
  error text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_runs_tenant_created_idx
  ON public.agent_runs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_tenant_status_idx
  ON public.agent_runs (tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_run_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  step text NOT NULL CHECK (step IN ('investigate','policy','execute','verify')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_run_evidence_run_idx
  ON public.agent_run_evidence (run_id, created_at ASC);
CREATE INDEX IF NOT EXISTS agent_run_evidence_tenant_idx
  ON public.agent_run_evidence (tenant_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.agent_runs TO authenticated;
GRANT SELECT, INSERT ON public.agent_run_evidence TO authenticated;
GRANT ALL ON public.agent_runs TO service_role;
GRANT ALL ON public.agent_run_evidence TO service_role;

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_run_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_runs_select ON public.agent_runs FOR SELECT TO authenticated
  USING (app_private.is_tenant_member(tenant_id));

CREATE POLICY agent_runs_insert ON public.agent_runs FOR INSERT TO authenticated
  WITH CHECK (app_private.is_tenant_member(tenant_id) AND (created_by IS NULL OR created_by = auth.uid()));

CREATE POLICY agent_runs_update ON public.agent_runs FOR UPDATE TO authenticated
  USING (app_private.is_tenant_member(tenant_id))
  WITH CHECK (app_private.is_tenant_member(tenant_id));

CREATE POLICY agent_run_evidence_select ON public.agent_run_evidence FOR SELECT TO authenticated
  USING (app_private.is_tenant_member(tenant_id));

CREATE POLICY agent_run_evidence_insert ON public.agent_run_evidence FOR INSERT TO authenticated
  WITH CHECK (app_private.is_tenant_member(tenant_id));

CREATE OR REPLACE FUNCTION public.agent_runs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_runs_updated_at_trg ON public.agent_runs;
CREATE TRIGGER agent_runs_updated_at_trg
  BEFORE UPDATE ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.agent_runs_updated_at();

COMMENT ON TABLE public.agent_runs IS
  'Tenant-scoped durable state for Aegis agent executions. State persistence does not authorize external mutations.';
COMMENT ON TABLE public.agent_run_evidence IS
  'Tenant-scoped evidence captured during an Aegis agent run; external writes remain approval/policy controlled.';
