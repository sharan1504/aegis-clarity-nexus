import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getMcpTenantContext } from "@/lib/mcp/tenant-data";

export default defineTool({
  name: "list_reports_and_recommendations",
  title: "List reports and AI recommendations",
  description: "Return only report evidence and proposed changes backed by this tenant's real synchronized data and change records.",
  inputSchema: { reportId: z.string().optional().describe("Provider dataset key, e.g. github or jira.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ reportId }, rawCtx) => {
    try {
      const { supabase, actor } = await getMcpTenantContext(rawCtx);
      const [entities, changes] = await Promise.all([
        supabase.from("provider_sync_entities").select("provider,entity_type,entity_key,payload,observed_at").eq("tenant_id", actor.tenantId).eq("stale", false).order("observed_at", { ascending: false }),
        supabase.from("change_records").select("change_id,title,stage,business_impact,ai_reasoning,risk,created_at").eq("tenant_id", actor.tenantId).order("created_at", { ascending: false }),
      ]);
      if (entities.error) throw entities.error;
      if (changes.error) throw changes.error;
      const grouped: Record<string, unknown[]> = {};
      for (const row of entities.data ?? []) (grouped[row.provider] ??= []).push(row);
      const key = reportId?.trim().toLowerCase();
      if (key) {
        const rows = grouped[key] ?? [];
        return { content: [{ type: "text", text: JSON.stringify({ reportId: key, rows }, null, 2) }], structuredContent: { reportId: key, rows } };
      }
      const recommendations = (changes.data ?? []).filter((r: any) => ["Proposed", "Owner Review", "Change Created", "Team Approvals"].includes(r.stage)).map((r: any) => ({ id: r.change_id, title: r.title, stage: r.stage, businessImpact: r.business_impact, aiReasoning: r.ai_reasoning, risk: r.risk, createdAt: r.created_at }));
      const reports = Object.entries(grouped).map(([provider, rows]) => ({ id: provider, provider, recordCount: rows.length }));
      const payload = { reports, datasets: grouped, recommendations };
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload };
    } catch (error) {
      return { content: [{ type: "text", text: error instanceof Error ? error.message : "Unable to read report data." }], isError: true };
    }
  },
});
