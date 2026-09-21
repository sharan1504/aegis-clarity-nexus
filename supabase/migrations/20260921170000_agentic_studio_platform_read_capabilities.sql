-- Agentic Studio: platform-global read capabilities and runtime status.
-- These capabilities are definition-level, read-only governance primitives. They do not
-- create provider bindings and do not authorize provider mutations.
INSERT INTO public.capabilities (capability_key, display_name, description, category, read_only, write_capable) VALUES
  ('tool_catalog','MCP Tool Catalog','Discover governed MCP tools exposed by Aegis.','platform',true,false),
  ('operations_overview','Operations Overview','Read tenant-scoped operational overview signals.','platform',true,false),
  ('change_records','Change Records','Read governed change records and proposals.','platform',true,false),
  ('agent_inventory','Agent Inventory','Read agent definitions and deployment metadata.','platform',true,false),
  ('integration_inventory','Integration Inventory','Read tenant integration inventory.','platform',true,false),
  ('incident_signals','Incident Signals','Read synchronized incident and alert signals.','platform',true,false),
  ('report_inventory','Report Inventory','Read synchronized reports and recommendations.','platform',true,false),
  ('agent_runtime','Agent Runtime','Read the state of a governed agent run.','platform',true,false)
ON CONFLICT (capability_key) DO NOTHING;

INSERT INTO public.agent_capabilities (agent_key, capability_id, required)
SELECT d.agent_key, c.id, false
FROM public.agent_definitions d
JOIN public.capabilities c
  ON c.capability_key IN (
    'tool_catalog','operations_overview','change_records','agent_inventory',
    'integration_inventory','incident_signals','report_inventory','agent_runtime'
  )
ON CONFLICT (agent_key, capability_id) DO NOTHING;

-- Keep the platform read surface available to newly defined agents without
-- creating any tenant/provider integration binding or write capability.
CREATE OR REPLACE FUNCTION public.seed_agent_platform_capabilities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.agent_capabilities (agent_key, capability_id, required)
  SELECT NEW.agent_key, c.id, false
  FROM public.capabilities c
  WHERE c.capability_key IN (
    'tool_catalog','operations_overview','change_records','agent_inventory',
    'integration_inventory','incident_signals','report_inventory','agent_runtime'
  )
  ON CONFLICT (agent_key, capability_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_agent_platform_capabilities_on_definition
  ON public.agent_definitions;

CREATE TRIGGER seed_agent_platform_capabilities_on_definition
AFTER INSERT ON public.agent_definitions
FOR EACH ROW
EXECUTE FUNCTION public.seed_agent_platform_capabilities();
