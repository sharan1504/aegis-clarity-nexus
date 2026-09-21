import type { UserClient } from "@/lib/execution/gateway.server";
import { resolveMcpToolCatalog, type RegisteredMcpTool } from "./catalog.server";

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

export interface AgentToolAvailability extends RegisteredMcpTool {
  available: boolean;
  reasons: string[];
}

export async function getAgentMcpToolAvailability(supabase: UserClient, tenantId: string, agentKey: string): Promise<AgentToolAvailability[]> {
  const [{ data: bindings, error }, { data: definition, error: definitionError }, { data: agentCapabilities, error: agentCapabilitiesError }, catalog] = await Promise.all([
    supabase
      .from("agent_integration_bindings")
      .select("enabled, capabilities!inner(capability_key)")
      .eq("tenant_id", tenantId)
      .eq("agent_key", agentKey)
      .eq("enabled", true),
    supabase
      .from("agent_definitions")
      .select("agent_key")
      .eq("agent_key", agentKey)
      .maybeSingle(),
    supabase
      .from("agent_capabilities")
      .select("capabilities!inner(capability_key)")
      .eq("agent_key", agentKey),
    resolveMcpToolCatalog(supabase, tenantId),
  ]);
  if (error) throw new Error("Unable to resolve agent tool availability: " + error.message);
  if (definitionError) throw new Error("Unable to resolve agent definition: " + definitionError.message);
  if (!definition) throw new Error("Agent definition " + agentKey + " was not found.");
  if (agentCapabilitiesError) throw new Error("Unable to resolve agent capabilities: " + agentCapabilitiesError.message);

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

  const toolBindingsResult = await (supabase as any)
    .from("mcp_tool_agent_bindings")
    .select("tool_definition_id,enabled")
    .eq("tenant_id", tenantId)
    .eq("agent_key", agentKey)
    .eq("enabled", true);
  if (toolBindingsResult.error) throw new Error("Unable to resolve explicit MCP tool bindings: " + toolBindingsResult.error.message);
  const explicitToolBindings = new Set((toolBindingsResult.data ?? []).map((row: any) => String(row.tool_definition_id)));

  const definitionIdsResult = await (supabase as any)
    .from("mcp_tool_definitions")
    .select("id,tool_name")
    .eq("enabled", true);
  if (definitionIdsResult.error) throw new Error("Unable to resolve MCP tool definition ids: " + definitionIdsResult.error.message);
  const idByName = new Map((definitionIdsResult.data ?? []).map((row: any) => [String(row.tool_name), String(row.id)]));

  return catalog.map((tool) => {
    const reasons: string[] = [];
    const platformGlobal = Boolean(tool.capability && PLATFORM_GLOBAL_READ_CAPABILITIES.has(tool.capability) && tool.readOnly);
    const definitionEnabled = Boolean(tool.capability && enabledDefinitionCapabilities.has(tool.capability));
    const bindingEnabled = Boolean(tool.capability && enabledCapabilities.has(tool.capability));
    const explicitExternal = tool.origin === "external" && Boolean(idByName.get(tool.name) && explicitToolBindings.has(idByName.get(tool.name)!));
    const authorized = tool.origin === "external" ? explicitExternal && enabledDefinitionCapabilities.has("external_tools") : (platformGlobal ? definitionEnabled : bindingEnabled);
    if (!authorized && tool.capability) {
      reasons.push(tool.origin === "external"
        ? "External MCP tool is not explicitly bound to this agent by a workspace admin or manager."
        : platformGlobal
          ? "Agent definition " + agentKey + " does not have the " + tool.capability + " platform capability enabled."
          : "Agent " + agentKey + " does not have the " + tool.capability + " capability enabled for a tenant integration binding.");
    }
    return { ...tool, available: authorized || !tool.capability, reasons };
  });
}
