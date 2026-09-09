-- Bind governed agent runs to the existing change-control path.
ALTER TABLE public.change_records
  ADD COLUMN IF NOT EXISTS agent_run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS change_records_agent_run_idx
  ON public.change_records (tenant_id, agent_run_id);

COMMENT ON COLUMN public.change_records.agent_run_id IS
  'Optional tenant-scoped link back to the durable Aegis agent run that proposed the change.';
