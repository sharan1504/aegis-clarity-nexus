-- Deterministic evaluation results for governed agent runs.
-- Evaluation records are observational/audit data and never authorize execution.

CREATE TABLE IF NOT EXISTS public.agent_evaluation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('passed','failed')),
  passed integer NOT NULL DEFAULT 0 CHECK (passed >= 0),
  failed integer NOT NULL DEFAULT 0 CHECK (failed >= 0),
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  evaluated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_evaluation_runs_tenant_created_idx
  ON public.agent_evaluation_runs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_evaluation_runs_run_idx
  ON public.agent_evaluation_runs (run_id, created_at DESC);

GRANT SELECT, INSERT ON public.agent_evaluation_runs TO authenticated;
GRANT ALL ON public.agent_evaluation_runs TO service_role;

ALTER TABLE public.agent_evaluation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_evaluation_runs_select ON public.agent_evaluation_runs FOR SELECT TO authenticated
  USING (app_private.is_tenant_member(tenant_id));

CREATE POLICY agent_evaluation_runs_insert ON public.agent_evaluation_runs FOR INSERT TO authenticated
  WITH CHECK (app_private.is_tenant_member(tenant_id) AND (evaluated_by IS NULL OR evaluated_by = auth.uid()));

COMMENT ON TABLE public.agent_evaluation_runs IS
  'Tenant-scoped deterministic evaluation results for Aegis agent runs. Evaluation never grants execution permission.';
