import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenantContext } from "@/lib/tenant-context.server";

export type AgentLearningOutcomeType =
  | "run_completed"
  | "run_failed"
  | "verification_passed"
  | "verification_failed"
  | "false_positive"
  | "false_negative"
  | "wrong_recommendation"
  | "missing_evidence"
  | "stale_evidence"
  | "operator_correction"
  | "remediation_success"
  | "remediation_failed";

export async function recordAgentLearningOutcome(supabase: any, input: {
  tenantId: string;
  agentRunId?: string | null;
  agentKey: string;
  outcomeType: AgentLearningOutcomeType;
  label?: string | null;
  notes?: string | null;
  score?: number | null;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
}) {
  const { error } = await supabase.from("agent_learning_outcomes").insert({
    tenant_id: input.tenantId,
    agent_run_id: input.agentRunId ?? null,
    agent_key: input.agentKey,
    outcome_type: input.outcomeType,
    label: input.label ?? null,
    notes: input.notes ?? null,
    score: input.score ?? null,
    metadata: input.metadata ?? {},
    created_by: input.createdBy ?? null,
  });
  if (error) throw new Error(error.message);
}

export const submitAgentFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    runId: string;
    outcomeType: AgentLearningOutcomeType;
    label?: string;
    notes?: string;
    score?: number;
    metadata?: Record<string, unknown>;
  }) => ({
    runId: String(input.runId ?? "").trim(),
    outcomeType: input.outcomeType,
    label: input.label?.trim().slice(0, 200),
    notes: input.notes?.trim().slice(0, 4000),
    score: typeof input.score === "number" && Number.isFinite(input.score) ? Math.max(0, Math.min(1, input.score)) : undefined,
    metadata: input.metadata ?? {},
  }))
  .handler(async ({ data, context }) => {
    try {
      if (!data.runId) throw new Error("An agent run id is required.");
      const tenant = await resolveTenantContext(context.supabase, context.userId);
      const { data: run, error: runError } = await context.supabase
        .from("agent_runs")
        .select("id,agent_key,tenant_id")
        .eq("id", data.runId)
        .eq("tenant_id", tenant.tenantId)
        .single();
      if (runError || !run) throw new Error(runError?.message ?? "Agent run was not found.");
      await recordAgentLearningOutcome(context.supabase, {
        tenantId: tenant.tenantId,
        agentRunId: run.id,
        agentKey: run.agent_key,
        outcomeType: data.outcomeType,
        label: data.label,
        notes: data.notes,
        score: data.score,
        metadata: data.metadata,
        createdBy: context.userId,
      });
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Agent feedback could not be recorded." };
    }
  });
