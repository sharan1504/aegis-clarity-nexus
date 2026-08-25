ALTER TABLE public.integrations DROP CONSTRAINT IF EXISTS integrations_tenant_id_provider_key;

CREATE UNIQUE INDEX IF NOT EXISTS integrations_tenant_provider_org_uniq
  ON public.integrations (tenant_id, provider, external_org_id)
  WHERE external_org_id IS NOT NULL;

ALTER TABLE public.integration_oauth_states
  ADD COLUMN IF NOT EXISTS integration_id uuid REFERENCES public.integrations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS integration_oauth_states_integration_idx
  ON public.integration_oauth_states (integration_id);