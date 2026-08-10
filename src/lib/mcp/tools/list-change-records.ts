import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { approvalProgress, changeRecords } from "@/lib/change-data";

export default defineTool({
  name: "list_change_records",
  title: "List change records",
  description:
    "List change records from the Aegis Change Control Center, with optional filtering by lifecycle stage, risk tier, execution mode, or owning team.",
  inputSchema: {
    stage: z.string().optional().describe("Lifecycle stage, e.g. 'Team Approvals'."),
    risk: z.string().optional().describe("Risk tier: Low, Medium, High, or Critical."),
    executionMode: z.string().optional().describe("Execution mode: Manual, Assisted, or Automatic."),
    ownerTeam: z.string().optional().describe("Owning team name (substring match)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ stage, risk, executionMode, ownerTeam }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const lower = (v?: string) => v?.trim().toLowerCase();
    const rows = changeRecords
      .filter((r) => !lower(stage) || r.stage.toLowerCase() === lower(stage))
      .filter((r) => !lower(risk) || r.risk.tier.toLowerCase() === lower(risk))
      .filter((r) => !lower(executionMode) || r.executionMode.toLowerCase() === lower(executionMode))
      .filter((r) => !lower(ownerTeam) || r.ownerTeam.toLowerCase().includes(lower(ownerTeam)!))
      .map((r) => {
        const progress = approvalProgress(r);
        return {
          id: r.id,
          title: r.title,
          stage: r.stage,
          risk: `${r.risk.tier} (${r.risk.score})`,
          executionMode: r.executionMode,
          ownerTeam: r.ownerTeam,
          agent: r.agent,
          window: `${r.window.start} → ${r.window.end}`,
          approvals: `${progress.approved} of ${progress.total} approvals`,
        };
      });

    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { count: rows.length, records: rows },
    };
  },
});
