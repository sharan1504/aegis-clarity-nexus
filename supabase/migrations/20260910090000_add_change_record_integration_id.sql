-- Bind governed provider mutations to the exact tenant integration that produced the evidence.
ALTER TABLE public.change_records
  ADD COLUMN IF NOT EXISTS integration_id uuid REFERENCES public.provider_connections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS change_records_tenant_integration_idx
  ON public.change_records (tenant_id, integration_id);
