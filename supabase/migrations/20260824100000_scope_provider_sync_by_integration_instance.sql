-- Department isolation must remain safe when a tenant has multiple instances
-- of the same provider. Provider-level filtering is insufficient because one
-- customer can have Production + Development + UAT connections.

ALTER TABLE public.provider_sync_entities
  ADD COLUMN IF NOT EXISTS connection_id uuid REFERENCES public.provider_connections(id) ON DELETE CASCADE;

ALTER TABLE public.provider_sync_runs
  ADD COLUMN IF NOT EXISTS connection_id uuid REFERENCES public.provider_connections(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.provider_sync_entities'::regclass
      AND conname = 'provider_sync_entities_tenant_id_provider_entity_type_entity_key_key'
  ) THEN
    ALTER TABLE public.provider_sync_entities
      DROP CONSTRAINT provider_sync_entities_tenant_id_provider_entity_type_entity_key_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS provider_sync_entities_instance_key_idx
  ON public.provider_sync_entities(tenant_id, provider, connection_id, entity_type, entity_key);

CREATE INDEX IF NOT EXISTS provider_sync_entities_connection_idx
  ON public.provider_sync_entities(tenant_id, connection_id, provider, stale);

CREATE TABLE IF NOT EXISTS public.department_provider_connection_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.provider_connections(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, department_id, connection_id)
);

ALTER TABLE public.department_provider_connection_access ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.department_provider_connection_access TO authenticated;
GRANT ALL ON public.department_provider_connection_access TO service_role;

DROP POLICY IF EXISTS "tenant members view department provider access" ON public.department_provider_connection_access;
CREATE POLICY "tenant members view department provider access" ON public.department_provider_connection_access
  FOR SELECT TO authenticated
  USING (tenant_id = app_private.current_tenant_id());

DROP POLICY IF EXISTS "tenant admins manage department provider access" ON public.department_provider_connection_access;
CREATE POLICY "tenant admins manage department provider access" ON public.department_provider_connection_access
  FOR ALL TO authenticated
  USING (tenant_id = app_private.current_tenant_id() AND app_private.has_tenant_role(tenant_id, 'admin'))
  WITH CHECK (tenant_id = app_private.current_tenant_id() AND app_private.has_tenant_role(tenant_id, 'admin'));

COMMENT ON TABLE public.department_provider_connection_access IS
  'Explicit department-to-provider-instance allow-list. When a provider has multiple instances, scoped AI access must use this table rather than provider-wide access.';
