-- Data-plane MCP registry and external MCP connection model.
CREATE TABLE IF NOT EXISTS public.mcp_tool_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  capability_key text NOT NULL REFERENCES public.capabilities(capability_key) ON DELETE RESTRICT,
  provider text,
  execution_class text NOT NULL DEFAULT 'read_only' CHECK (execution_class IN ('read_only','low_risk','approval_gated')),
  read_only boolean NOT NULL DEFAULT true,
  origin text NOT NULL DEFAULT 'builtin' CHECK (origin IN ('builtin','auto','external')),
  handler_kind text NOT NULL CHECK (handler_kind IN ('entity_query','capability_router','platform_overview','change_records','propose_change','external_mcp','list_meta')),
  handler_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS mcp_tool_definitions_capability_idx ON public.mcp_tool_definitions(capability_key);
CREATE INDEX IF NOT EXISTS mcp_tool_definitions_provider_idx ON public.mcp_tool_definitions(provider);
ALTER TABLE public.mcp_tool_definitions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.mcp_tool_definitions TO authenticated;
GRANT ALL ON public.mcp_tool_definitions TO service_role;
DROP POLICY IF EXISTS "mcp tool definitions readable" ON public.mcp_tool_definitions;
CREATE POLICY "mcp tool definitions readable" ON public.mcp_tool_definitions FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.mcp_server_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  base_url text NOT NULL,
  auth_type text NOT NULL DEFAULT 'bearer' CHECK (auth_type IN ('bearer','none','oauth_ref')),
  secret_ref text,
  encrypted_auth text,
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected','connected','error')),
  last_discovered_at timestamptz,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, display_name)
);
CREATE INDEX IF NOT EXISTS mcp_server_connections_tenant_idx ON public.mcp_server_connections(tenant_id);
ALTER TABLE public.mcp_server_connections ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_server_connections TO authenticated;
GRANT ALL ON public.mcp_server_connections TO service_role;
DROP POLICY IF EXISTS "mcp servers select tenant" ON public.mcp_server_connections;
CREATE POLICY "mcp servers select tenant" ON public.mcp_server_connections FOR SELECT TO authenticated
  USING (app_private.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "mcp servers insert managers" ON public.mcp_server_connections;
CREATE POLICY "mcp servers insert managers" ON public.mcp_server_connections FOR INSERT TO authenticated
  WITH CHECK (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(),'admin') OR app_private.has_role(auth.uid(),'manager')));
DROP POLICY IF EXISTS "mcp servers update managers" ON public.mcp_server_connections;
CREATE POLICY "mcp servers update managers" ON public.mcp_server_connections FOR UPDATE TO authenticated
  USING (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(),'admin') OR app_private.has_role(auth.uid(),'manager')))
  WITH CHECK (app_private.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "mcp servers delete managers" ON public.mcp_server_connections;
CREATE POLICY "mcp servers delete managers" ON public.mcp_server_connections FOR DELETE TO authenticated
  USING (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(),'admin') OR app_private.has_role(auth.uid(),'manager')));

CREATE TRIGGER mcp_tool_definitions_updated_at BEFORE UPDATE ON public.mcp_tool_definitions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER mcp_server_connections_updated_at BEFORE UPDATE ON public.mcp_server_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.capabilities (capability_key, display_name, description, category, read_only, write_capable) VALUES
  ('operations_overview','Operations Overview','Read the tenant operations snapshot.','operations',true,false),
  ('integration_inventory','Integration Inventory','Read connected integration metadata and health.','platform',true,false),
  ('agent_inventory','Agent Inventory','Read deployed agent definitions and bindings.','platform',true,false),
  ('change_records','Change Records','Read and propose governed change records.','governance',true,true),
  ('incident_signals','Incident Signals','Read synchronized incident and alert evidence.','operations',true,false),
  ('report_inventory','Report Inventory','Read reports and evidence-backed recommendations.','reporting',true,false),
  ('tool_catalog','Tool Catalog','Read the governed MCP tool catalog.','platform',true,false),
  ('knowledge_inventory','Knowledge Inventory','Read synchronized knowledge source metadata.','knowledge',true,false),
  ('external_tools','External MCP Tools','Read tools exposed by a customer-managed MCP server.','integration',true,false)
ON CONFLICT (capability_key) DO NOTHING;

INSERT INTO public.agent_capabilities (agent_key, capability_id, required)
SELECT a.agent_key, c.id, false
FROM public.agent_definitions a
JOIN public.capabilities c ON c.capability_key IN
  ('operations_overview','integration_inventory','agent_inventory','change_records','incident_signals','report_inventory','tool_catalog','agent_runtime')
ON CONFLICT (agent_key, capability_id) DO NOTHING;

INSERT INTO public.agent_capabilities (agent_key, capability_id, required)
SELECT v.agent_key, c.id, v.required
FROM (VALUES
  ('agent-license','license_inventory',true),('agent-license','user_inventory',true),
  ('agent-cost','cost_inventory',true),('agent-cost','cloud_resource_inventory',false),
  ('agent-security','security_findings',true),('agent-security','user_inventory',true),
  ('agent-ccx','queue_inventory',true),('agent-ccx','presence_inventory',false),('agent-ccx','routing_inventory',false),('agent-ccx','user_inventory',false),
  ('agent-incident','incident_signals',false),('agent-incident','security_findings',false),
  ('agent-knowledge','knowledge_inventory',false),('agent-knowledge','user_inventory',false),('agent-knowledge','license_inventory',false),
  ('agent-workflow','change_records',false),('agent-workflow','user_inventory',false),
  ('agent-productivity','productivity_activity',true),('agent-productivity','user_inventory',false)
) AS v(agent_key, capability_key, required)
JOIN public.agent_definitions a ON a.agent_key = v.agent_key
JOIN public.capabilities c ON c.capability_key = v.capability_key
ON CONFLICT (agent_key, capability_id) DO NOTHING;

INSERT INTO public.mcp_tool_definitions
  (tool_name,title,description,capability_key,provider,execution_class,read_only,origin,handler_kind,handler_config)
VALUES
 ('list_available_tools','List available Aegis tools','Describe the governed MCP catalog.','tool_catalog',NULL,'read_only',true,'builtin','list_meta','{}'),
 ('get_operations_overview','Get operations overview','Read the tenant operations snapshot.','operations_overview',NULL,'read_only',true,'builtin','platform_overview','{}'),
 ('list_change_records','List change records','Read governed change records.','change_records',NULL,'read_only',true,'builtin','change_records','{}'),
 ('get_change_record','Get change record','Read one governed change record.','change_records',NULL,'read_only',true,'builtin','change_records','{}'),
 ('list_agents','List AI agents','Read agent definitions and tenant bindings.','agent_inventory',NULL,'read_only',true,'builtin','list_meta','{}'),
 ('list_integrations','List integrations','Read connected integration metadata.','integration_inventory',NULL,'read_only',true,'builtin','list_meta','{}'),
 ('list_incidents_and_alerts','List incidents and alerts','Read synchronized incident evidence.','incident_signals',NULL,'read_only',true,'builtin','capability_router','{}'),
 ('list_license_signals','List license signals','Read synchronized license evidence.','license_inventory',NULL,'read_only',true,'builtin','capability_router','{}'),
 ('get_agent_run_status','Get agent run status','Read durable agent runtime status and evidence counts.','agent_runtime',NULL,'read_only',true,'builtin','list_meta','{}'),
 ('list_reports_and_recommendations','List reports and recommendations','Read evidence-backed reports and recommendations.','report_inventory',NULL,'read_only',true,'builtin','list_meta','{}'),
 ('propose_change_record','Propose change record','Create a governed change proposal; never executes a provider mutation.','change_records',NULL,'low_risk',false,'builtin','propose_change','{}')
ON CONFLICT (tool_name) DO UPDATE SET capability_key=EXCLUDED.capability_key, handler_kind=EXCLUDED.handler_kind, execution_class=EXCLUDED.execution_class, read_only=EXCLUDED.read_only, updated_at=now();
