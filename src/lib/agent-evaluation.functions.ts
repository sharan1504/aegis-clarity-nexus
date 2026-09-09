import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenantContext } from "@/lib/tenant-context.server";
import { evaluateAgentRun } from "./agent-evaluation";
import type { AgentRunEvent } from "./agent-run-events";
import type { AgentRunState } from "./agent-runtime";

const errorResult = (error: unknown) => ({
  ok: false as const,
  error: error instanceof Error ? error.message : "Agent evaluation failed.",
});

async function loadEvaluationInput(supabase: any, tenantId: string, runId: string) {
  const { data: row, error } = await supabase
    .from("agent_runs")
    .select("id, tenant_id, agent_key, status, current_step, input, plan, policy_verdict, approval, execution, verification, error, created_at, updated_at")
    .eq("id", runId)
    .eq("tenant_id", tenantId)
    .single();
  if (error || !row) throw new Error(error?.message ?? "Agent run was not found.");

  const { data: evidenceRows, error: evidenceError } = await supabase
    .from("agent_run_evidence")
    .select("evidence")
    .eq("run_id", runId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  if (evidenceError) throw new Error(evidenceError.message);

  const { data: eventRows, error: eventError } = await supabase
    .from("agent_run_events")
    .select("id, run_id, tenant_id, sequence, event_type, step, actor_id, provider, capability_key, outcome, payload, occurred_at")
    .eq("run_id", runId)
    .eq("tenant_id", tenantId)
    .order("sequence", { ascending: true });
  if (eventError) throw new Error(eventError.message);

  const run: AgentRunState = {
    runId: `run-${row.id}`,
    tenantId: row.tenant_id,
    agentKey: row.agent_key,
    status: row.status,
    currentStep: row.current_step,
    input: row.input,
    plan: row.plan,
    evidence: (evidenceRows ?? []).map((item: { evidence: unknown }) => item.evidence),
    policyVerdict: row.policy_verdict,
    approval: row.approval,
    execution: row.execution,
    verification: row.verification,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return { run, events: (eventRows ?? []) as AgentRunEvent[] };
}

export const evaluateAgentRunFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string }) => ({ runId: String(input.runId ?? "").trim() }))
  .handler(async ({ data, context }) => {
    try {
      if (!data.runId) throw new Error("A run id is required.");
      const tenant = await resolveTenantContext(context.supabase, context.userId);
      const { run, events } = await loadEvaluationInput(context.supabase, tenant.tenantId, data.runId);
      const result = evaluateAgentRun(run, events);
      const { data: saved, error } = await context.supabase
        .from("agent_evaluation_runs")
        .insert({
          tenant_id: tenant.tenantId,
          run_id: data.runId,
          status: result.status,
          passed: result.passed,
          failed: result.failed,
          results: result.results,
          evaluated_by: context.userId,
        })
        .select("id, created_at")
        .single();
      if (error || !saved) throw new Error(error?.message ?? "Evaluation result could not be persisted.");
      return { ok: true as const, evaluationId: saved.id, createdAt: saved.created_at, result };
    } catch (error) {
      return errorResult(error);
    }
  });

export const getAgentEvaluations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string }) => ({ runId: String(input.runId ?? "").trim() }))
  .handler(async ({ data, context }) => {
    try {
      const tenant = await resolveTenantContext(context.supabase, context.userId);
      const { data: rows, error } = await context.supabase
        .from("agent_evaluation_runs")
        .select("id, run_id, status, passed, failed, results, evaluated_by, created_at")
        .eq("run_id", data.runId)
        .eq("tenant_id", tenant.tenantId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return { ok: true as const, evaluations: rows ?? [] };
    } catch (error) {
      return errorResult(error);
    }
  });
