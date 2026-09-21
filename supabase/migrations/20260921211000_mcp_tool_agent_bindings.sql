CREATE TABLE IF NOT EXISTS public.mcp_tool_agent_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_key text NOT NULL REFERENCES public.agent_definitions(agent_key) ON DELETE CASCADE,
  tool_definition_id uuid NOT NULL REFERENCES public.mcp_tool_definitions(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, agent_key, tool_definition_id)
);
ALTER TABLE public.mcp_tool_agent_bindings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_tool_agent_bindings TO authenticated;
GRANT ALL ON public.mcp_tool_agent_bindings TO service_role;
DROP POLICY IF EXISTS "mcp tool bindings select tenant" ON public.mcp_tool_agent_bindings;
CREATE POLICY "mcp tool bindings select tenant" ON public.mcp_tool_agent_bindings FOR SELECT TO authenticated
USING (app_private.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "mcp tool bindings insert managers" ON public.mcp_tool_agent_bindings;
CREATE POLICY "mcp tool bindings insert managers" ON public.mcp_tool_agent_bindings FOR INSERT TO authenticated
WITH CHECK (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(),'admin') OR app_private.has_role(auth.uid(),'manager'))
  AND EXISTS (SELECT 1 FROM public.mcp_tool_definitions d WHERE d.id = tool_definition_id AND d.enabled = true)
  AND EXISTS (SELECT 1 FROM public.agent_definitions a WHERE a.agent_key = mcp_tool_agent_bindings.agent_key));
DROP POLICY IF EXISTS "mcp tool bindings update managers" ON public.mcp_tool_agent_bindings;
CREATE POLICY "mcp tool bindings update managers" ON public.mcp_tool_agent_bindings FOR UPDATE TO authenticated
USING (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(),'admin') OR app_private.has_role(auth.uid(),'manager')))
WITH CHECK (app_private.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "mcp tool bindings delete managers" ON public.mcp_tool_agent_bindings;
CREATE POLICY "mcp tool bindings delete managers" ON public.mcp_tool_agent_bindings FOR DELETE TO authenticated
USING (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(),'admin') OR app_private.has_role(auth.uid(),'manager')));
CREATE TRIGGER mcp_tool_agent_bindings_updated_at BEFORE UPDATE ON public.mcp_tool_agent_bindings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.agent_capabilities (agent_key, capability_id, required)
SELECT a.agent_key, c.id, false
FROM public.agent_definitions a
JOIN public.capabilities c ON c.capability_key = 'external_tools'
ON CONFLICT (agent_key, capability_id) DO NOTHING;
