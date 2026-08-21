import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getMcpTenantContext } from "@/lib/mcp/tenant-data";

export default defineTool({
  name: "get_change_record",
  title: "Get change record",
  description: "Get a real tenant-scoped change record from the same change_records table used by the application UI.",
  inputSchema: { id: z.string().describe("Change ID.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, rawCtx) => {
    try {
      const { supabase, actor } = await getMcpTenantContext(rawCtx);
      const { data, error } = await supabase.from("change_records").select("*,change_approvals(*)").eq("tenant_id", actor.tenantId).eq("change_id", id.trim()).maybeSingle();
      if (error) throw error;
      if (!data) throw new ToolError(`No change record found with ID ${id}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: { record: data } };
    } catch (error) {
      if (error instanceof ToolError) throw error;
      return { content: [{ type: "text", text: error instanceof Error ? error.message : "Unable to read change record." }], isError: true };
    }
  },
});
