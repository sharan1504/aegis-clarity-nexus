CREATE TABLE IF NOT EXISTS public.agent_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_key text NOT NULL,
  name text NOT NULL,
  description text,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_required boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_outcomes_tenant_agent_idx ON public.agent_outcomes(tenant_id, agent_key);
ALTER TABLE public.agent_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_outcomes_member_select ON public.agent_outcomes FOR SELECT TO authenticated USING (app_private.is_tenant_member(tenant_id));
CREATE POLICY agent_outcomes_admin_insert ON public.agent_outcomes FOR INSERT TO authenticated WITH CHECK (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(), 'admin') OR app_private.has_role(auth.uid(), 'manager')));
CREATE POLICY agent_outcomes_admin_update ON public.agent_outcomes FOR UPDATE TO authenticated USING (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(), 'admin') OR app_private.has_role(auth.uid(), 'manager'))) WITH CHECK (app_private.is_tenant_member(tenant_id));
CREATE POLICY agent_outcomes_admin_delete ON public.agent_outcomes FOR DELETE TO authenticated USING (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(), 'admin') OR app_private.has_role(auth.uid(), 'manager')));

CREATE TABLE IF NOT EXISTS public.agent_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_agent_key text NOT NULL,
  target_agent_key text NOT NULL,
  purpose text,
  allowed_capabilities text[] NOT NULL DEFAULT '{}',
  approval_required boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_agent_key <> target_agent_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_connections_unique_idx ON public.agent_connections(tenant_id, source_agent_key, target_agent_key);
ALTER TABLE public.agent_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_connections_member_select ON public.agent_connections FOR SELECT TO authenticated USING (app_private.is_tenant_member(tenant_id));
CREATE POLICY agent_connections_admin_insert ON public.agent_connections FOR INSERT TO authenticated WITH CHECK (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(), 'admin') OR app_private.has_role(auth.uid(), 'manager')));
CREATE POLICY agent_connections_admin_update ON public.agent_connections FOR UPDATE TO authenticated USING (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(), 'admin') OR app_private.has_role(auth.uid(), 'manager'))) WITH CHECK (app_private.is_tenant_member(tenant_id));
CREATE POLICY agent_connections_admin_delete ON public.agent_connections FOR DELETE TO authenticated USING (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(), 'admin') OR app_private.has_role(auth.uid(), 'manager')));

CREATE OR REPLACE VIEW public.stale_agent_integration_bindings AS
SELECT b.id, b.tenant_id, b.agent_key, b.integration_id, b.capability_id, b.created_at
FROM public.agent_integration_bindings b
LEFT JOIN public.integrations i ON i.id = b.integration_id
WHERE b.is_mock = true AND b.created_at < now() - interval '7 days'
  AND (i.id IS NULL OR i.is_mock = true OR i.status <> 'connected');
