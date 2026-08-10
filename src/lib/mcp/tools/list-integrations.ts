import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { integrations } from "@/lib/mock-data";

export default defineTool({
  name: "list_integrations",
  title: "List integrations",
  description:
    "List the Aegis platform integrations (Genesys, AWS, Azure, Microsoft 365, Jira, ServiceNow, Salesforce, Slack, GitHub, ...) with connection status, auth type, and last sync.",
  inputSchema: {
    status: z
      .string()
      .optional()
      .describe("Filter by status: connected, available, or action_required."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ status }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const wanted = status?.trim().toLowerCase();
    const rows = integrations
      .filter((i) => !wanted || i.status === wanted)
      .map(({ logo: _logo, ...rest }) => rest);

    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { count: rows.length, integrations: rows },
    };
  },
});
