import type { UserClient } from "@/lib/execution/gateway.server";
import { resolveAgentDataSourceBindings } from "@/lib/capabilities/bindings.server";
import { providerImplements } from "@/lib/capabilities/router.server";
import { MCP_TOOL_CATALOG, type McpToolCatalogEntry } from "./gateway-catalog";

type AgentCapabilityBinding = {
  capability_id: string;
  integration_id: string;
  enabled: boolean;
};

export interface AgentToolAvailability extends McpToolCatalogEntry {
  available: boolean;
  reasons: string[];
}

/**
 * Resolve the MCP tools an agent may actually discover at runtime.
 *
 * Discovery is intentionally narrower than invocation: this helper only
 * describes availability. The existing MCP governance gate remains the final
 * authorization boundary for every invocation.
 */
export async function getAgentMcpToolAvailability(
  supabase: UserClient,
  agentKey: string,
): Promise<AgentToolAvailability[]> {
  const bindings = (await resolveAgentDataSourceBindings(supabase, agentKey)) as AgentCapabilityBinding[];
  const enabledCapabilities = new Set(
    bindings.filter((binding) => binding.enabled).map((binding) => binding.capability_id),
  );

  return MCP_TOOL_CATALOG.map((tool) => {
    const reasons: string[] = [];

    if (tool.capability && !enabledCapabilities.has(tool.capability)) {
      reasons.push(`Agent ${agentKey} does not have the ${tool.capability} capability enabled.`);
    }

    if (tool.provider && !providerImplements(tool.provider, tool.capability ?? "")) {
      reasons.push(`${tool.provider} does not implement ${tool.capability ?? "this capability"}.`);
    }

    return {
      ...tool,
      available: reasons.length === 0,
      reasons,
    };
  });
}

export function availableAgentMcpTools(tools: AgentToolAvailability[]): AgentToolAvailability[] {
  return tools.filter((tool) => tool.available);
}
