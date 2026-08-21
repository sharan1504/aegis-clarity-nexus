import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getMcpTenantContext } from "@/lib/mcp/tenant-data";

export default defineTool({
  name: "list_agents",
  title: "List AI agents",
  description: "List agent definitions and only the real tenant-scoped bindings currently deployed in this workspace.",
  inputSchema: { includeFindings: z.boolean().optional().describe("Include provider-backed finding records when available.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ includeFindings }, rawCtx) => {
    try {
      const { supabase, actor } = await getMcpTenantContext(rawCtx);
      const [defs, bindings] = await Promise.all([
        supabase.from("agent_definitions").select("agent_key,display_name,category,description").order("display_name"),
        supabase.from("agent_integration_bindings").select("agent_key,integration_id,capability_id,enabled,created_at").eq("tenant_id", actor.tenantId).eq("enabled", true),
      ]);
      if (defs.error) throw defs.error;
      if (bindings.error) throw bindings.error;
      const bindingRows = bindings.data ?? [];
      const byAgent = new Map<string, typeof bindingRows>();
      for (const row of bindingRows) byAgent.set(row.agent_key, [...(byAgent.get(row.agent_key) ?? []), row]);
      const rows = (defs.data ?? []).filter((d) => byAgent.has(d.agent_key)).map((d) => ({
        ...d,
        status: "deployed",
        bindings: byAgent.get(d.agent_key) ?? [],
        ...(includeFindings ? { findings: [] } : {}),
      }));
      return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }], structuredContent: { count: rows.length, agents: rows } };
    } catch (error) {
      return { content: [{ type: "text", text: error instanceof Error ? error.message : "Unable to read agents." }], isError: true };
    }
  },
});
