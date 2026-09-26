-- Governed learning/outcome ledger. This stores outcomes and human feedback for
-- evaluation and playbook ranking; it never rewrites model policy at runtime.
CREATE TABLE IF NOT EXISTS public.agent_learning_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  agent_key text NOT NULL,
  outcome_type text NOT NULL CHECK (outcome_type IN (
    'run_completed','run_failed','verification_passed','verification_failed',
    'false_positive','false_negative','wrong_recommendation','missing_evidence',
    'stale_evidence','operator_correction','remediation_success','remediation_failed'
  )),
  label text,
  notes text,
  score numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_learning_outcomes_tenant_agent_idx
  ON public.agent_learning_outcomes(tenant_id, agent_key, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_learning_outcomes_run_idx
  ON public.agent_learning_outcomes(agent_run_id, created_at DESC);

ALTER TABLE public.agent_learning_outcomes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.agent_learning_outcomes TO authenticated;
GRANT ALL ON public.agent_learning_outcomes TO service_role;

DROP POLICY IF EXISTS agent_learning_outcomes_select ON public.agent_learning_outcomes;
CREATE POLICY agent_learning_outcomes_select ON public.agent_learning_outcomes
  FOR SELECT TO authenticated
  USING (tenant_id = app_private.current_tenant_id());

DROP POLICY IF EXISTS agent_learning_outcomes_insert ON public.agent_learning_outcomes;
CREATE POLICY agent_learning_outcomes_insert ON public.agent_learning_outcomes
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = app_private.current_tenant_id() AND (created_by IS NULL OR created_by = auth.uid()));
