import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { incidents, securityAlerts } from "@/lib/mock-data";

export default defineTool({
  name: "list_incidents_and_alerts",
  title: "List incidents and security alerts",
  description:
    "List open operational incidents and security alerts, optionally filtered by severity (critical, high, medium, low, info).",
  inputSchema: {
    severity: z.string().optional().describe("Filter both lists by severity."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ severity }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const wanted = severity?.trim().toLowerCase();
    const payload = {
      incidents: incidents.filter((i) => !wanted || i.severity === wanted),
      securityAlerts: securityAlerts.filter((a) => !wanted || a.severity === wanted),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
