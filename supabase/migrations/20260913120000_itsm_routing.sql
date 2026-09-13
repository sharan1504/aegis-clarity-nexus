CREATE TABLE IF NOT EXISTS public.itsm_routing_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('jira', 'servicenow')),
  target_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  issue_type text,
  default_priority_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  notification_emails text[] NOT NULL DEFAULT '{}',
  automatic_trigger_enabled boolean NOT NULL DEFAULT false,
  automatic_trigger_stage text,
  automatic_trigger_severity text,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS itsm_routing_config_tenant_idx ON public.itsm_routing_config (tenant_id, provider, is_default);
CREATE UNIQUE INDEX IF NOT EXISTS itsm_routing_config_default_provider_idx ON public.itsm_routing_config (tenant_id, provider) WHERE is_default = true;
CREATE UNIQUE INDEX IF NOT EXISTS itsm_routing_config_integration_idx ON public.itsm_routing_config (tenant_id, integration_id);
ALTER TABLE public.itsm_routing_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY itsm_routing_member_select ON public.itsm_routing_config FOR SELECT TO authenticated USING (app_private.is_tenant_member(tenant_id));
CREATE POLICY itsm_routing_admin_insert ON public.itsm_routing_config FOR INSERT TO authenticated WITH CHECK (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(), 'admin') OR app_private.has_role(auth.uid(), 'manager')));
CREATE POLICY itsm_routing_admin_update ON public.itsm_routing_config FOR UPDATE TO authenticated USING (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(), 'admin') OR app_private.has_role(auth.uid(), 'manager'))) WITH CHECK (app_private.is_tenant_member(tenant_id));
CREATE POLICY itsm_routing_admin_delete ON public.itsm_routing_config FOR DELETE TO authenticated USING (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(), 'admin') OR app_private.has_role(auth.uid(), 'manager')));
