import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";
import { DEMO_DATA_ENABLED, DEMO_AGENT_WORKFLOWS } from "@/lib/demo-data";

export type AgentWorkflowStepInput = {
  id: string; name: string; type: string; provider?: string; capability?: string; action: string; requiresApproval?: boolean; verification?: string;
};

export const saveAgentWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentKey: string; trigger: string; config: Record<string, unknown>; steps: AgentWorkflowStepInput[]; prompt?: string; summary?: string }) => ({
    agentKey: String(input?.agentKey ?? "").trim(), trigger: String(input?.trigger ?? "").trim(), config: input?.config ?? {}, steps: Array.isArray(input?.steps) ? input.steps : [], prompt: String(input?.prompt ?? "").trim().slice(0, 6000), summary: String(input?.summary ?? "").trim().slice(0, 1000),
  }))
  .handler(async ({ data, context }) => {
    if (!data.agentKey) return { ok: false as const, error: "Agent key is required." };
    if (DEMO_DATA_ENABLED && DEMO_AGENT_WORKFLOWS[data.agentKey]) return { ok: true as const, demo: true as const };
    const { tenantId } = await resolveTenant(context.supabase, context.userId);
    const db = context.supabase as any;
    const { error: configError } = await db.from("agent_workflow_configs").upsert({ tenant_id: tenantId, agent_key: data.agentKey, trigger_config: { trigger: data.trigger, prompt: data.prompt || null, summary: data.summary || null }, policy: data.config, updated_by: context.userId }, { onConflict: "tenant_id,agent_key" });
    if (configError) throw configError;
    const { error: deleteError } = await db.from("agent_workflow_steps").delete().eq("tenant_id", tenantId).eq("agent_key", data.agentKey);
    if (deleteError) throw deleteError;
    if (data.steps.length) {
      const rows = data.steps.map((step, index) => ({ tenant_id: tenantId, agent_key: data.agentKey, step_key: step.id, step_number: index + 1, name: step.name, step_type: step.type, provider: step.provider ?? null, capability_key: step.capability ?? null, action: step.action, config: {}, requires_approval: Boolean(step.requiresApproval), verification: step.verification ?? null }));
      const { error } = await db.from("agent_workflow_steps").insert(rows); if (error) throw error;
    }
    return { ok: true as const, demo: false as const };
  });
