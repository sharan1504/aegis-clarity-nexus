import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { agentFindings, agents } from "@/lib/mock-data";

export default defineTool({
  name: "list_agents",
  title: "List AI agents",
  description:
    "List the Aegis AI operations agents with status, domain, action counts, and (optionally) their recent findings.",
  inputSchema: {
    includeFindings: z
      .boolean()
      .optional()
      .describe("Include each agent's recent findings. Defaults to false."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ includeFindings }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const rows = agents.map((a) => {
      const { icon: _icon, ...rest } = a as unknown as Record<string, unknown>;
      return includeFindings
        ? { ...rest, findings: agentFindings[a.name] ?? [] }
        : rest;
    });

    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { count: rows.length, agents: rows },
    };
  },
});
