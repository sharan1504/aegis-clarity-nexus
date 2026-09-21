import { describe, expect, it } from "vitest";

import { availableAgentMcpTools, getAgentMcpToolAvailability } from "./agent-tool-availability.server";
import type { AgentToolAvailability } from "./agent-tool-availability.server";

describe("agent MCP tool availability", () => {
  it("hides tools whose governed capability is not bound to the agent", async () => {
    const chain = (result: unknown) => ({ eq: () => ({ eq: () => ({ eq: async () => result }) }) });
    const supabase = {
      from: (table: string) => {
        if (table === "agent_integration_bindings") return { select: () => chain({ data: [], error: null }) };
        if (table === "agent_definitions") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { agent_key: "agent-security" }, error: null }) }) }) };
        if (table === "agent_capabilities") return { select: () => ({ eq: async () => ({ data: [{ capabilities: { capability_key: "change_records" } }], error: null }) }) };
        if (table === "mcp_tool_definitions") {
          return { select: () => ({
            eq: async () => ({ data: [
              { id: "tool-change", tool_name: "list_change_records", title: "List changes", description: "Read changes", capability_key: "change_records", provider: null, execution_class: "read_only", read_only: true, origin: "builtin", handler_kind: "change_records", handler_config: {}, enabled: true },
              { id: "tool-agents", tool_name: "list_agents", title: "List agents", description: "Read agents", capability_key: "agent_inventory", provider: null, execution_class: "read_only", read_only: true, origin: "builtin", handler_kind: "list_meta", handler_config: {}, enabled: true },
            ], error: null })
          }) };
        }
        if (table === "mcp_tool_agent_bindings") return { select: () => chain({ data: [], error: null }) };
        return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
      },
    };

    const tools = await getAgentMcpToolAvailability(supabase as never, "tenant-1", "agent-security");
    expect(tools.find((tool) => tool.name === "list_change_records")?.available).toBe(true);
    expect(tools.find((tool) => tool.name === "list_agents")?.available).toBe(false);
  });

  it("returns only available tools", () => {
    const tools = [
      { name: "read", available: true },
      { name: "blocked", available: false },
    ] as unknown as AgentToolAvailability[];
    expect(availableAgentMcpTools(tools).map((tool) => tool.name)).toEqual(["read"]);
  });
});
