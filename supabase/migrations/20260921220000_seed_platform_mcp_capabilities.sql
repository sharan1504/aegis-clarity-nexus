-- Ensure every existing agent can use the tenant-scoped platform MCP read surface.
-- Domain/provider-backed tools remain gated by real integration bindings.
INSERT INTO public.capabilities (capability_key, display_name, description, category, read_only, write_capable) VALUES
  ('tool_catalog','Tool Catalog','Read the governed MCP tool catalog.','platform',true,false),
  ('operations_overview','Operations Overview','Read the tenant operations snapshot.','operations',true,false),
  ('change_records','Change Records','Read and propose governed change records.','governance',true,true),
  ('agent_inventory','Agent Inventory','Read deployed agent definitions and bindings.','platform',true,false),
  ('integration_inventory','Integration Inventory','Read connected integration metadata and health.','platform',true,false),
  ('incident_signals','Incident Signals','Read synchronized incident and alert evidence.','operations',true,false),
  ('report_inventory','Report Inventory','Read reports and evidence-backed recommendations.','reporting',true,false),
  ('agent_runtime','Agent Runtime','Read durable agent runtime status and evidence counts.','platform',true,false)
ON CONFLICT (capability_key) DO NOTHING;

INSERT INTO public.agent_capabilities (agent_key, capability_id, required)
SELECT a.agent_key, c.id, false
FROM public.agent_definitions a
CROSS JOIN public.capabilities c
WHERE c.capability_key IN (
  'tool_catalog',
  'operations_overview',
  'change_records',
  'agent_inventory',
  'integration_inventory',
  'incident_signals',
  'report_inventory',
  'agent_runtime'
)
ON CONFLICT (agent_key, capability_id) DO NOTHING;
