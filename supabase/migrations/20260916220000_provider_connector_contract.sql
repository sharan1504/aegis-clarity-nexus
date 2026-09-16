-- Provider connector contract evidence.
-- These fields make connection status evidence-based instead of credential-based.
ALTER TABLE public.provider_connections
  ADD COLUMN IF NOT EXISTS health_status text NOT NULL DEFAULT 'unknown'
    CHECK (health_status IN ('healthy','unhealthy','unknown')),
  ADD COLUMN IF NOT EXISTS health_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS health_error text,
  ADD COLUMN IF NOT EXISTS last_sync_status text NOT NULL DEFAULT 'never'
    CHECK (last_sync_status IN ('running','success','failed','never')),
  ADD COLUMN IF NOT EXISTS last_sync_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_successful_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_record_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_error text;

CREATE INDEX IF NOT EXISTS provider_connections_contract_status_idx
  ON public.provider_connections (tenant_id, provider, status, health_status, last_sync_status);

COMMENT ON COLUMN public.provider_connections.status IS
  'Configured credential state. UI connected state must be derived from health_status + last_sync_status evidence.';
COMMENT ON COLUMN public.provider_connections.health_status IS
  'Last real provider health result; never inferred from credential presence.';
COMMENT ON COLUMN public.provider_connections.last_sync_status IS
  'Last persisted provider sync result; connected requires success.';
