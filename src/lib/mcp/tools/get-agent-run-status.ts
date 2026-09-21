import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getMcpTenantContext } from "@/lib/mcp/tenant-data";

export default defineTool({
  name: "get_agent_run_status",
  title: "Get agent run status",
  description: "Read the persisted state and evidence count of a governed agent run in the current tenant.",
  inputSchema: { runId: z.string().trim().min(1).describe("Persisted agent run id.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ runId }, rawCtx) => {
    try {
      const { supabase, actor } = await getMcpTenantContext(rawCtx);
      const { data: run, error } = await supabase
        .from("agent_runs")
        .select("id,agent_key,status,current_step,policy_verdict,approval,execution,verification,error,created_at,updated_at")
        .eq("tenant_id", actor.tenantId)
        .eq("id", runId.trim())
        .maybeSingle();
      if (error) throw error;
      if (!run) throw new Error("Agent run was not found in the current tenant.");
      const { count, error: evidenceError } = await supabase
        .from("agent_run_evidence")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", actor.tenantId)
        .eq("run_id", run.id);
      if (evidenceError) throw evidenceError;
      const payload = { ...run, evidenceCount: count ?? 0 };
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload };
    } catch (error) {
      return { content: [{ type: "text", text: error instanceof Error ? error.message : "Unable to read agent run status." }], isError: true };
    }
  },
});
