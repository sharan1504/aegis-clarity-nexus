import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAgentDetail } from "@/lib/agent-detail.server";

export type { AgentDetail, AgentDetailBinding, AgentDetailChange, AgentDetailActivity, AgentWorkflow, AgentWorkflowStep, AgentWorkflowConfig } from "@/lib/agent-detail.server";

export const getAgentDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentKey: string }) => {
    const agentKey = String(input?.agentKey ?? "").trim();
    if (!agentKey) throw new Error("An agent key is required.");
    return { agentKey };
  })
  .handler(async ({ data, context }) => loadAgentDetail(context.supabase, context.userId, data.agentKey));
