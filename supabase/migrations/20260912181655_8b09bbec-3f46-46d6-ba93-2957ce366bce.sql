CREATE TABLE IF NOT EXISTS public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_key text NOT NULL, status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','running','waiting_approval','paused','completed','failed','cancelled')),
  current_step text NOT NULL DEFAULT 'plan' CHECK (current_step IN ('plan','investigate','policy','approval','execute','verify')),
  input text NOT NULL, plan jsonb, policy_verdict jsonb, approval jsonb, execution jsonb, verification jsonb, error text,
  created_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.agent_runs TO authenticated; GRANT ALL ON public.agent_runs TO service_role;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_runs_select ON public.agent_runs; CREATE POLICY agent_runs_select ON public.agent_runs FOR SELECT TO authenticated USING (app_private.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS agent_runs_insert ON public.agent_runs; CREATE POLICY agent_runs_insert ON public.agent_runs FOR INSERT TO authenticated WITH CHECK (app_private.is_tenant_member(tenant_id) AND (created_by IS NULL OR created_by = auth.uid()));
DROP POLICY IF EXISTS agent_runs_update ON public.agent_runs; CREATE POLICY agent_runs_update ON public.agent_runs FOR UPDATE TO authenticated USING (app_private.is_tenant_member(tenant_id)) WITH CHECK (app_private.is_tenant_member(tenant_id));

CREATE TABLE IF NOT EXISTS public.agent_run_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE, step text NOT NULL CHECK (step IN ('investigate','policy','execute','verify')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.agent_run_evidence TO authenticated; GRANT ALL ON public.agent_run_evidence TO service_role;
ALTER TABLE public.agent_run_evidence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_run_evidence_select ON public.agent_run_evidence; CREATE POLICY agent_run_evidence_select ON public.agent_run_evidence FOR SELECT TO authenticated USING (app_private.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS agent_run_evidence_insert ON public.agent_run_evidence; CREATE POLICY agent_run_evidence_insert ON public.agent_run_evidence FOR INSERT TO authenticated WITH CHECK (app_private.is_tenant_member(tenant_id));

CREATE TABLE IF NOT EXISTS public.agent_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE, sequence integer NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('run_created','stage_started','stage_completed','approval_requested','approval_resolved','tool_call','execution_attempted','execution_completed','verification_completed','run_failed','run_cancelled')),
  step text CHECK (step IS NULL OR step IN ('plan','investigate','policy','approval','execute','verify')), actor_id uuid REFERENCES auth.users(id),
  provider text, capability_key text, outcome text, payload jsonb NOT NULL DEFAULT '{}'::jsonb, occurred_at timestamptz NOT NULL DEFAULT now(), UNIQUE (run_id, sequence)
);
GRANT SELECT, INSERT ON public.agent_run_events TO authenticated; GRANT ALL ON public.agent_run_events TO service_role;
ALTER TABLE public.agent_run_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_run_events_select ON public.agent_run_events; CREATE POLICY agent_run_events_select ON public.agent_run_events FOR SELECT TO authenticated USING (app_private.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS agent_run_events_insert ON public.agent_run_events; CREATE POLICY agent_run_events_insert ON public.agent_run_events FOR INSERT TO authenticated WITH CHECK (app_private.is_tenant_member(tenant_id) AND (actor_id IS NULL OR actor_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.agent_evaluation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE, status text NOT NULL CHECK (status IN ('passed','failed')),
  passed integer NOT NULL DEFAULT 0 CHECK (passed >= 0), failed integer NOT NULL DEFAULT 0 CHECK (failed >= 0), results jsonb NOT NULL DEFAULT '[]'::jsonb,
  evaluated_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.agent_evaluation_runs TO authenticated; GRANT ALL ON public.agent_evaluation_runs TO service_role;
ALTER TABLE public.agent_evaluation_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_evaluation_runs_select ON public.agent_evaluation_runs; CREATE POLICY agent_evaluation_runs_select ON public.agent_evaluation_runs FOR SELECT TO authenticated USING (app_private.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS agent_evaluation_runs_insert ON public.agent_evaluation_runs; CREATE POLICY agent_evaluation_runs_insert ON public.agent_evaluation_runs FOR INSERT TO authenticated WITH CHECK (app_private.is_tenant_member(tenant_id) AND (evaluated_by IS NULL OR evaluated_by = auth.uid()));

CREATE TABLE IF NOT EXISTS public.github_synced_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.provider_connections(id) ON DELETE CASCADE, entity_type text NOT NULL CHECK (entity_type IN ('repository','workflow_run','security_alert')),
  entity_key text NOT NULL, repository_name text, workflow_status text, workflow_conclusion text, alert_severity text, alert_title text, alert_state text,
  html_url text, provider_updated_at timestamptz, synced_at timestamptz NOT NULL DEFAULT now(), stale boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb, UNIQUE (tenant_id, connection_id, entity_type, entity_key)
);
GRANT SELECT ON public.github_synced_entities TO authenticated; GRANT ALL ON public.github_synced_entities TO service_role;
ALTER TABLE public.github_synced_entities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "github synced entities tenant members can read" ON public.github_synced_entities; CREATE POLICY "github synced entities tenant members can read" ON public.github_synced_entities FOR SELECT TO authenticated USING (app_private.is_tenant_member(tenant_id));

CREATE TABLE IF NOT EXISTS public.github_sync_status (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE, connection_id uuid NOT NULL REFERENCES public.provider_connections(id) ON DELETE CASCADE,
  last_attempted_at timestamptz, last_successful_at timestamptz, status text NOT NULL DEFAULT 'never', error_message text,
  repositories_count integer NOT NULL DEFAULT 0, workflow_runs_count integer NOT NULL DEFAULT 0, security_alerts_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id, connection_id)
);
GRANT SELECT ON public.github_sync_status TO authenticated; GRANT ALL ON public.github_sync_status TO service_role;
ALTER TABLE public.github_sync_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "github sync status tenant members can read" ON public.github_sync_status; CREATE POLICY "github sync status tenant members can read" ON public.github_sync_status FOR SELECT TO authenticated USING (app_private.is_tenant_member(tenant_id));

CREATE INDEX IF NOT EXISTS agent_runs_tenant_created_idx ON public.agent_runs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_run_evidence_run_idx ON public.agent_run_evidence (run_id, created_at ASC);
CREATE INDEX IF NOT EXISTS agent_run_events_run_sequence_idx ON public.agent_run_events (run_id, sequence ASC);
CREATE INDEX IF NOT EXISTS agent_evaluation_runs_run_idx ON public.agent_evaluation_runs (run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS github_synced_entities_connection_idx ON public.github_synced_entities (tenant_id, connection_id);