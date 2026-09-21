import type { UserClient } from "@/lib/execution/gateway.server";
import { MCP_TOOL_CATALOG, type McpToolDescriptor } from "./gateway-catalog";

const PLATFORM_GLOBAL_READ_CAPABILITIES = new Set([
  "tool_catalog",
  "operations_overview",
  "change_records",
  "agent_inventory",
  "integration_inventory",
  "incident_signals",
  "report_inventory",
  "agent_runtime",
]);

export interface AgentToolAvailability extends McpToolDescriptor {
  available: boolean;
  reasons: string[];
}

export async function getAgentMcpToolAvailability(supabase: UserClient, tenantId: string, agentKey: string): Promise<AgentToolAvailability[]> {
  const { data: bindings, error } = await supabase
    .from("agent_integration_bindings")
    .select("enabled, capabilities!inner(capability_key)")
    .eq("tenant_id", tenantId)
    .eq("agent_key", agentKey)
    .eq("enabled", true);
  if (error) throw new Error(`Unable to resolve agent tool availability: ${error.message}`);

  const { data: definition, error: definitionError } = await supabase
    .from("agent_definitions")
    .select("agent_key")
    .eq("agent_key", agentKey)
    .maybeSingle();
  if (definitionError) throw new Error(`Unable to resolve agent definition: ${definitionError.message}`);
  if (!definition) throw new Error(`Agent definition ${agentKey} was not found.`);

  const { data: agentCapabilities, error: agentCapabilitiesError } = await supabase
    .from("agent_capabilities")
    .select("capabilities!inner(capability_key)")
    .eq("agent_key", agentKey);
  if (agentCapabilitiesError) throw new Error(`Unable to resolve agent capabilities: ${agentCapabilitiesError.message}`);

  const enabledDefinitionCapabilities = new Set(
    (agentCapabilities ?? []).map((row) => {
      const capability = row.capabilities as unknown as { capability_key?: string } | null;
      return capability?.capability_key;
    }).filter((key): key is string => Boolean(key)),
  );

  const enabledCapabilities = new Set(
    (bindings ?? []).map((binding) => {
      const capability = binding.capabilities as unknown as { capability_key?: string } | null;
      return capability?.capability_key;
    }).filter((key): key is string => Boolean(key)),
  );

  return MCP_TOOL_CATALOG.map((tool) => {
    const reasons: string[] = [];
    const platformGlobal = Boolean(tool.capability && PLATFORM_GLOBAL_READ_CAPABILITIES.has(tool.capability) && tool.readOnly);
    const definitionEnabled = Boolean(tool.capability && enabledDefinitionCapabilities.has(tool.capability));
    const bindingEnabled = Boolean(tool.capability && enabledCapabilities.has(tool.capability));
    const authorized = platformGlobal ? definitionEnabled : bindingEnabled;
    if (!authorized && tool.capability) {
      reasons.push(platformGlobal
        ? `Agent definition ${agentKey} does not have the ${tool.capability} platform capability enabled.`
        : `Agent ${agentKey} does not have the ${tool.capability} capability enabled for a tenant integration binding.`);
    }
    return { ...tool, available: authorized || !tool.capability, reasons };
  });
}

export function availableAgentMcpTools(tools: AgentToolAvailability[]): AgentToolAvailability[] {
  return tools.filter((tool) => tool.available);
}
