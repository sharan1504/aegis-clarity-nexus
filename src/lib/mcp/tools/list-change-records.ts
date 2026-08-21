import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getMcpTenantContext } from "@/lib/mcp/tenant-data";

export default defineTool({
  name: "list_change_records",
  title: "List change records",
  description: "List real tenant-scoped Change Control Center records from the same change_records table used by the application UI.",
  inputSchema: {
    stage: z.string().optional().describe("Lifecycle stage."),
    risk: z.string().optional().describe("Risk tier."),
    executionMode: z.string().optional().describe("Execution mode."),
    ownerTeam: z.string().optional().describe("Owning team substring."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ stage, risk, executionMode, ownerTeam }, rawCtx) => {
    try {
      const { supabase, actor } = await getMcpTenantContext(rawCtx);
      const { data, error } = await supabase.from("change_records").select("*,change_approvals(*)").eq("tenant_id", actor.tenantId).order("created_at", { ascending: false });
      if (error) throw error;
      const lower = (v?: string) => v?.trim().toLowerCase();
      const rows = (data ?? []).filter((r: any) => !lower(stage) || String(r.stage ?? "").toLowerCase() === lower(stage))
        .filter((r: any) => !lower(risk) || String(r.risk?.tier ?? "").toLowerCase() === lower(risk))
        .filter((r: any) => !lower(executionMode) || String(r.execution_mode ?? "").toLowerCase() === lower(executionMode))
        .filter((r: any) => !lower(ownerTeam) || String(r.owner_team ?? "").toLowerCase().includes(lower(ownerTeam)!))
        .map((r: any) => ({ id: r.change_id, rowId: r.id, title: r.title, stage: r.stage, risk: r.risk, executionMode: r.execution_mode, ownerTeam: r.owner_team, agent: r.agent, window: r.change_window, approvals: (r.change_approvals ?? []).map((a: any) => ({ team: a.team, status: a.status, decidedAt: a.decided_at, approver: a.approver })) }));
      return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }], structuredContent: { count: rows.length, records: rows } };
    } catch (error) {
      return { content: [{ type: "text", text: error instanceof Error ? error.message : "Unable to read change records." }], isError: true };
    }
  },
});
