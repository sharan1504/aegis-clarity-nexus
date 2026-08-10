import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { changeRecords } from "@/lib/change-data";

export default defineTool({
  name: "get_change_record",
  title: "Get change record",
  description:
    "Get the full change record for a Change ID, including AI reasoning, risk factors, approvals, rollback plan, validations, timeline, audit hashes, and external tickets.",
  inputSchema: {
    id: z.string().describe("Change ID, e.g. CHG0012345."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const record = changeRecords.find((r) => r.id.toLowerCase() === id.trim().toLowerCase());
    if (!record) throw new ToolError(`No change record found with ID ${id}`);

    return {
      content: [{ type: "text", text: JSON.stringify(record, null, 2) }],
      structuredContent: { record },
    };
  },
});
