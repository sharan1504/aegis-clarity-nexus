ALTER TABLE public.provider_sync_runs
  ADD COLUMN IF NOT EXISTS connection_id uuid REFERENCES public.provider_connections(id) ON DELETE CASCADE;

ALTER TABLE public.provider_sync_entities
  ADD COLUMN IF NOT EXISTS connection_id uuid REFERENCES public.provider_connections(id) ON DELETE CASCADE;

ALTER TABLE public.provider_sync_entities
  DROP CONSTRAINT IF EXISTS provider_sync_entities_tenant_id_provider_entity_type_entit_key;

CREATE UNIQUE INDEX IF NOT EXISTS provider_sync_entities_instance_uniq
  ON public.provider_sync_entities (tenant_id, provider, connection_id, entity_type, entity_key);

CREATE INDEX IF NOT EXISTS provider_sync_entities_connection_idx
  ON public.provider_sync_entities (connection_id);

CREATE INDEX IF NOT EXISTS provider_sync_runs_connection_idx
  ON public.provider_sync_runs (connection_id);