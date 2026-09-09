import { defineTool } from "@lovable.dev/mcp-js";
import { getMcpTenantContext } from "@/lib/mcp/tenant-data";
import { getMcpToolCatalog } from "../gateway.server";

export default defineTool({
  name: "list_available_tools",
  title: "List available Aegis tools",
  description:
    "Describe the governed MCP tool catalog. This is metadata only; it does not grant permission to call a tool or execute a change.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, rawCtx) => {
    try {
      const { actor } = await getMcpTenantContext(rawCtx);
      const tools = getMcpToolCatalog().map((tool) => ({
        ...tool,
        tenantId: actor.tenantId,
        note: tool.approvalRequired
          ? "Calling this tool still requires the normal Aegis approval/governance checks."
          : "Calling this tool still requires the normal Aegis identity and guardrail checks.",
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(tools, null, 2) }],
        structuredContent: { count: tools.length, tools },
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error instanceof Error ? error.message : "Unable to list Aegis tools." }],
        isError: true,
      };
    }
  },
});
