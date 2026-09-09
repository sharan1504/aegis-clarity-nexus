import { describe, expect, it } from "vitest";

import { availableAgentMcpTools, getAgentMcpToolAvailability } from "./agent-tools.server";
import type { AgentToolAvailability } from "./agent-tools.server";

describe("agent MCP tool availability", () => {
  it("hides tools whose governed capability is not bound to the agent", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: async () => ({
              data: [{ enabled: true, capabilities: { capability_key: "change_records" } }],
              error: null,
            }),
          }),
        }),
      }),
    };

    const tools = await getAgentMcpToolAvailability(supabase as never, "agent-security");
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
