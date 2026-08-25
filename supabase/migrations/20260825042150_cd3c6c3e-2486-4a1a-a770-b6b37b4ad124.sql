CREATE TABLE IF NOT EXISTS public.department_provider_connection_access (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.provider_connections(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, department_id, connection_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.department_provider_connection_access TO authenticated;
GRANT ALL ON public.department_provider_connection_access TO service_role;

ALTER TABLE public.department_provider_connection_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members view department connection access"
  ON public.department_provider_connection_access FOR SELECT TO authenticated
  USING (tenant_id = app_private.current_tenant_id());

CREATE POLICY "tenant admins manage department connection access"
  ON public.department_provider_connection_access FOR ALL TO authenticated
  USING (tenant_id = app_private.current_tenant_id() AND app_private.has_tenant_role(tenant_id, 'admin'))
  WITH CHECK (tenant_id = app_private.current_tenant_id() AND app_private.has_tenant_role(tenant_id, 'admin'));

CREATE TRIGGER department_provider_connection_access_updated_at
  BEFORE UPDATE ON public.department_provider_connection_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();