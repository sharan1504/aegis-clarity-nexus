import { describe, expect, it } from "vitest";

import { availableAgentMcpTools, getAgentMcpToolAvailability } from "./agent-tool-availability.server";
import type { AgentToolAvailability } from "./agent-tool-availability.server";

describe("agent MCP tool availability", () => {
  it("hides tools whose governed capability is not bound to the agent", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "agent_integration_bindings") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          };
        }

        if (table === "agent_definitions") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { agent_key: "agent-security" },
                  error: null,
                }),
              }),
            }),
          };
        }

        return {
          select: () => ({
            eq: async () => ({
              data: [
                { capabilities: { capability_key: "change_records" } },
              ],
              error: null,
            }),
          }),
        };
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
