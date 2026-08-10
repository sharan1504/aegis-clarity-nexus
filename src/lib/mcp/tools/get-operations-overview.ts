import { defineTool } from "@lovable.dev/mcp-js";

import { costByCloud, healthTrend, incidentsByService, kpis } from "@/lib/mock-data";

export default defineTool({
  name: "get_operations_overview",
  title: "Get operations overview",
  description:
    "Get the executive dashboard snapshot: platform health, cost savings, active incidents, security alerts, plus health/cost trend, cost by cloud, and incidents by service.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const overview = { kpis, healthTrend, costByCloud, incidentsByService };

    return {
      content: [{ type: "text", text: JSON.stringify(overview, null, 2) }],
      structuredContent: overview,
    };
  },
});
