import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { recommendations, reportDatasets, reports } from "@/lib/mock-data";

export default defineTool({
  name: "list_reports_and_recommendations",
  title: "List reports and AI recommendations",
  description:
    "List available executive reports (with their dataset rows) and the pending AI recommendations that feed the Change Control Center.",
  inputSchema: {
    reportId: z
      .string()
      .optional()
      .describe("Return only this report's rows, e.g. license-utilization."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ reportId }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const key = reportId?.trim();
    const payload = key
      ? { reportId: key, rows: reportDatasets[key] ?? [] }
      : { reports, datasets: reportDatasets, recommendations };

    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
