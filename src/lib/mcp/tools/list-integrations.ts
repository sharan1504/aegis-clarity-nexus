import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getMcpTenantContext } from "@/lib/mcp/tenant-data";

export default defineTool({
  name: "list_integrations",
  title: "List integrations",
  description: "List the current tenant's real provider integrations, connection status, and sync freshness.",
  inputSchema: { status: z.string().optional().describe("Filter by connected, available, or action_required.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status }, rawCtx) => {
    try {
      const { supabase } = await getMcpTenantContext(rawCtx);
      let query = supabase.from("integrations").select("id,provider,display_name,status,auth_type,last_synced_at,created_at").order("display_name");
      const wanted = status?.trim().toLowerCase();
      if (wanted) query = query.eq("status", wanted);
      const { data, error } = await query;
      if (error) throw error;
      const rows = data ?? [];
      return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }], structuredContent: { count: rows.length, integrations: rows } };
    } catch (error) {
      return { content: [{ type: "text", text: error instanceof Error ? error.message : "Unable to read integrations." }], isError: true };
    }
  },
});
