-- Tenant-specific, editable agent workflow blueprints. Runtime execution remains behind
-- the existing governance/execution gateway; this table only stores configuration.
CREATE TABLE IF NOT EXISTS public.agent_workflow_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_key text NOT NULL REFERENCES public.agent_definitions(agent_key) ON DELETE CASCADE,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, agent_key)
);
CREATE TABLE IF NOT EXISTS public.agent_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_key text NOT NULL REFERENCES public.agent_definitions(agent_key) ON DELETE CASCADE,
  step_key text NOT NULL,
  step_number integer NOT NULL,
  name text NOT NULL,
  step_type text NOT NULL CHECK (step_type IN ('intent','evidence','tool_call','decision','action','approval','verification','response')),
  provider text,
  capability_key text,
  action text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  requires_approval boolean NOT NULL DEFAULT false,
  verification text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, agent_key, step_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_workflow_configs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_workflow_steps TO authenticated;
GRANT ALL ON public.agent_workflow_configs, public.agent_workflow_steps TO service_role;
ALTER TABLE public.agent_workflow_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_workflow_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent workflow configs tenant read" ON public.agent_workflow_configs FOR SELECT TO authenticated USING (app_private.is_tenant_member(tenant_id));
CREATE POLICY "agent workflow configs managers write" ON public.agent_workflow_configs FOR ALL TO authenticated USING (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(),'admin') OR app_private.has_role(auth.uid(),'manager'))) WITH CHECK (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(),'admin') OR app_private.has_role(auth.uid(),'manager')));
CREATE POLICY "agent workflow steps tenant read" ON public.agent_workflow_steps FOR SELECT TO authenticated USING (app_private.is_tenant_member(tenant_id));
CREATE POLICY "agent workflow steps managers write" ON public.agent_workflow_steps FOR ALL TO authenticated USING (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(),'admin') OR app_private.has_role(auth.uid(),'manager'))) WITH CHECK (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(),'admin') OR app_private.has_role(auth.uid(),'manager')));
CREATE INDEX IF NOT EXISTS agent_workflow_configs_tenant_agent_idx ON public.agent_workflow_configs(tenant_id, agent_key);
CREATE INDEX IF NOT EXISTS agent_workflow_steps_tenant_agent_idx ON public.agent_workflow_steps(tenant_id, agent_key, step_number);
CREATE TRIGGER agent_workflow_configs_updated_at BEFORE UPDATE ON public.agent_workflow_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER agent_workflow_steps_updated_at BEFORE UPDATE ON public.agent_workflow_steps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
