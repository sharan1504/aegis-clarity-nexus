-- Immutable event history for governed Aegis agent runs.
-- Events describe what the runtime recorded; they do not authorize external mutations.

CREATE TABLE IF NOT EXISTS public.agent_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'run_created','stage_started','stage_completed','approval_requested',
    'approval_resolved','execution_attempted','execution_completed',
    'verification_completed','run_failed','run_cancelled'
  )),
  step text CHECK (step IS NULL OR step IN ('plan','investigate','policy','approval','execute','verify')),
  actor_id uuid REFERENCES auth.users(id),
  provider text,
  capability_key text,
  outcome text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, sequence)
);

CREATE INDEX IF NOT EXISTS agent_run_events_run_sequence_idx
  ON public.agent_run_events (run_id, sequence ASC);
CREATE INDEX IF NOT EXISTS agent_run_events_tenant_occurred_idx
  ON public.agent_run_events (tenant_id, occurred_at DESC);

GRANT SELECT, INSERT ON public.agent_run_events TO authenticated;
GRANT ALL ON public.agent_run_events TO service_role;

ALTER TABLE public.agent_run_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_run_events_select ON public.agent_run_events FOR SELECT TO authenticated
  USING (app_private.is_tenant_member(tenant_id));

CREATE POLICY agent_run_events_insert ON public.agent_run_events FOR INSERT TO authenticated
  WITH CHECK (app_private.is_tenant_member(tenant_id) AND (actor_id IS NULL OR actor_id = auth.uid()));

COMMENT ON TABLE public.agent_run_events IS
  'Append-only audit timeline for Aegis agent runs. Event history records runtime facts and never grants execution permission.';
