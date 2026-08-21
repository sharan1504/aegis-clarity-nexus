import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { resolveActor, userClientFromToken } from "@/lib/execution/gateway.server";
import { createProposedChangeRecord } from "@/lib/change-proposal.server";

export default defineTool({
  name: "propose_change_record",
  title: "Propose a change record",
  description:
    "Draft a tenant-scoped change record for human review. This tool can only create a Proposed record with pending approval; it cannot approve, execute, or select an execution mode.",
  inputSchema: {
    title: z.string().min(1).describe("Proposed change title."),
    businessImpact: z.string().min(1).describe("Evidence-backed business impact."),
    aiReasoning: z.string().min(1).describe("AI reasoning/rationale supporting the proposal."),
    proposedRiskFactors: z.array(z.string().min(1)).min(1).describe("Risk factors proposed by the calling agent; these remain unscored until the normal approval/risk pipeline evaluates them."),
    targetProvider: z.string().min(1).describe("Provider the proposed change concerns."),
    targetAgent: z.string().min(1).describe("Aegis agent or workflow responsible for the proposal."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated() || !ctx.token || !ctx.userId) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = userClientFromToken(ctx.token);
    const actor = await resolveActor(supabase, ctx.userId);
    const result = await createProposedChangeRecord(supabase, actor, input);
    return {
      content: [{ type: "text", text: JSON.stringify({ ...result, approvalStatus: "pending", executionStatus: "not_executed" }, null, 2) }],
      structuredContent: { ...result, approvalStatus: "pending", executionStatus: "not_executed" },
    };
  },
});
