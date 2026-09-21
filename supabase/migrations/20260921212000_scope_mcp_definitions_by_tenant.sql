ALTER TABLE public.mcp_tool_definitions ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS mcp_tool_definitions_tenant_idx ON public.mcp_tool_definitions(tenant_id);
DROP POLICY IF EXISTS "mcp tool definitions readable" ON public.mcp_tool_definitions;
CREATE POLICY "mcp tool definitions readable" ON public.mcp_tool_definitions FOR SELECT TO authenticated
USING (tenant_id IS NULL OR app_private.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "mcp tool definitions insert managers" ON public.mcp_tool_definitions;
CREATE POLICY "mcp tool definitions insert managers" ON public.mcp_tool_definitions FOR INSERT TO authenticated
WITH CHECK ((tenant_id IS NULL AND origin IN ('builtin','auto') AND (origin = 'builtin' OR app_private.has_role(auth.uid(),'admin') OR app_private.has_role(auth.uid(),'manager'))) OR
  (tenant_id IS NOT NULL AND app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(),'admin') OR app_private.has_role(auth.uid(),'manager'))));
DROP POLICY IF EXISTS "mcp tool definitions update managers" ON public.mcp_tool_definitions;
CREATE POLICY "mcp tool definitions update managers" ON public.mcp_tool_definitions FOR UPDATE TO authenticated
USING ((tenant_id IS NULL AND origin = 'builtin') OR (tenant_id IS NOT NULL AND app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(),'admin') OR app_private.has_role(auth.uid(),'manager'))))
WITH CHECK (tenant_id IS NULL OR app_private.is_tenant_member(tenant_id));
