import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getMcpTenantContext, normalizeSeverity } from "@/lib/mcp/tenant-data";

export default defineTool({
  name: "list_incidents_and_alerts",
  title: "List incidents and security alerts",
  description: "List only real incident and security-alert signals present in the tenant's synchronized provider data. No fallback or demo data is used.",
  inputSchema: { severity: z.string().optional().describe("Filter by provider-reported severity when present.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ severity }, rawCtx) => {
    try {
      const { supabase, actor } = await getMcpTenantContext(rawCtx);
      const { data, error } = await supabase.from("provider_sync_entities").select("provider,entity_type,entity_key,payload,observed_at").eq("tenant_id", actor.tenantId).eq("stale", false).in("entity_type", ["incident", "alert", "security_alert", "securityAlert"]);
      if (error) throw error;
      const wanted = normalizeSeverity(severity);
      const incidents = (data ?? []).filter((row: any) => ["incident"].includes(row.entity_type) && (!wanted || normalizeSeverity(row.payload?.severity) === wanted));
      const securityAlerts = (data ?? []).filter((row: any) => ["alert", "security_alert", "securityAlert"].includes(row.entity_type) && (!wanted || normalizeSeverity(row.payload?.severity) === wanted));
      const payload = { incidents, securityAlerts };
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload };
    } catch (error) {
      return { content: [{ type: "text", text: error instanceof Error ? error.message : "Unable to read incident data." }], isError: true };
    }
  },
});
