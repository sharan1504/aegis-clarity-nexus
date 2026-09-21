import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getMcpTenantContext } from "@/lib/mcp/tenant-data";

export default defineTool({
  name: "list_license_signals",
  title: "List license signals",
  description: "Read synchronized license and license-assignment records for the tenant. No provider mutation is performed.",
  inputSchema: {
    provider: z.string().optional().describe("Optional provider filter."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ provider }, rawCtx) => {
    try {
      const { supabase, actor } = await getMcpTenantContext(rawCtx);
      let query = supabase
        .from("provider_sync_entities")
        .select("provider,entity_type,entity_key,payload,observed_at")
        .eq("tenant_id", actor.tenantId)
        .eq("stale", false)
        .in("entity_type", ["license", "license_assignment"])
        .order("observed_at", { ascending: false });
      if (provider?.trim()) query = query.eq("provider", provider.trim().toLowerCase());
      const { data, error } = await query;
      if (error) throw error;
      const rows = data ?? [];
      const licenses = rows.filter((row: any) => row.entity_type === "license");
      const assignments = rows.filter((row: any) => row.entity_type === "license_assignment");
      const payload = { licenses, assignments, counts: { licenses: licenses.length, assignments: assignments.length } };
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload };
    } catch (error) {
      return { content: [{ type: "text", text: error instanceof Error ? error.message : "Unable to read license signals." }], isError: true };
    }
  },
});
