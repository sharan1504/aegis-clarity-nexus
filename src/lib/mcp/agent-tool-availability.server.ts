import type { UserClient } from "@/lib/execution/gateway.server";
import { MCP_TOOL_CATALOG, type McpToolDescriptor } from "./gateway-catalog";

export interface AgentToolAvailability extends McpToolDescriptor {
  available: boolean;
  reasons: string[];
}

export async function getAgentMcpToolAvailability(supabase: UserClient, agentKey: string): Promise<AgentToolAvailability[]> {
  const { data: bindings, error } = await supabase
    .from("agent_integration_bindings")
    .select("enabled, capabilities!inner(capability_key)")
    .eq("agent_key", agentKey)
    .eq("enabled", true);
  if (error) throw new Error(`Unable to resolve agent tool availability: ${error.message}`);

  const enabledCapabilities = new Set(
    (bindings ?? []).map((binding) => {
      const capability = binding.capabilities as unknown as { capability_key?: string } | null;
      return capability?.capability_key;
    }).filter((key): key is string => Boolean(key)),
  );

  return MCP_TOOL_CATALOG.map((tool) => {
    const reasons: string[] = [];
    if (tool.capability && !enabledCapabilities.has(tool.capability)) {
      reasons.push(`Agent ${agentKey} does not have the ${tool.capability} capability enabled.`);
    }
    return { ...tool, available: reasons.length === 0, reasons };
  });
}

export function availableAgentMcpTools(tools: AgentToolAvailability[]): AgentToolAvailability[] {
  return tools.filter((tool) => tool.available);
}
