-- Keep the generic integration-instance schema aligned with the Integrations UI.
-- Older databases may already have provider_connections without environment.
ALTER TABLE public.provider_connections
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'Production';

CREATE INDEX IF NOT EXISTS provider_connections_tenant_provider_updated_idx
  ON public.provider_connections (tenant_id, provider, updated_at DESC);
