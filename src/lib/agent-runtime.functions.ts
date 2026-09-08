import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenantContext } from "@/lib/tenant-context.server";
import {
  createAgentRunState,
  transitionAgentRun,
  type AgentRunState,
  type AgentRunStep,
} from "@/lib/agent-runtime";

function runtimeError(error: unknown) {
  return {
    ok: false as const,
    error: error instanceof Error ? error.message : "Agent runtime operation failed.",
  };
}

function toPersistedRun(run: AgentRunState) {
  return {
    id: run.runId.replace(/^run-/, ""),
    tenant_id: run.tenantId,
    agent_key: run.agentKey,
    status: run.status,
    current_step: run.currentStep,
    input: run.input,
    plan: run.plan,
    policy_verdict: run.policyVerdict,
    approval: run.approval,
    execution: run.execution,
    verification: run.verification,
    error: run.error,
  };
}

async function loadRun(supabase: any, tenantId: string, runId: string): Promise<AgentRunState> {
  const { data, error } = await supabase
    .from("agent_runs")
    .select("id, tenant_id, agent_key, status, current_step, input, plan, policy_verdict, approval, execution, verification, error, created_at, updated_at")
    .eq("id", runId)
    .eq("tenant_id", tenantId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Agent run was not found.");

  const { data: evidenceRows, error: evidenceError } = await supabase
    .from("agent_run_evidence")
    .select("evidence")
    .eq("run_id", runId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  if (evidenceError) throw new Error(evidenceError.message);

  return {
    runId: `run-${data.id}`,
    tenantId: data.tenant_id,
    agentKey: data.agent_key,
    status: data.status,
    currentStep: data.current_step,
    input: data.input,
    plan: data.plan,
    evidence: (evidenceRows ?? []).map((row: { evidence: unknown }) => row.evidence),
    policyVerdict: data.policy_verdict,
    approval: data.approval,
    execution: data.execution,
    verification: data.verification,
    error: data.error,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export const createAgentRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentKey: string; input: string }) => ({
    agentKey: String(input.agentKey ?? "").trim(),
    input: String(input.input ?? "").trim().slice(0, 6000),
  }))
  .handler(async ({ data, context }) => {
    try {
      if (!data.agentKey) throw new Error("An agent key is required.");
      if (!data.input) throw new Error("A run input is required.");
      const tenant = await resolveTenantContext(context.supabase, context.userId);
      const run = createAgentRunState({ tenantId: tenant.tenantId, agentKey: data.agentKey, input: data.input });
      const persisted = toPersistedRun(run);
      const { data: created, error } = await (context.supabase as any)
        .from("agent_runs")
        .insert({ ...persisted, id: undefined, created_by: context.userId })
        .select("id, created_at, updated_at")
        .single();
      if (error || !created) throw new Error(error?.message ?? "Agent run could not be created.");
      return { ok: true as const, runId: created.id, status: run.status, currentStep: run.currentStep };
    } catch (error) {
      return runtimeError(error);
    }
  });

export const getAgentRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string }) => ({ runId: String(input.runId ?? "").trim() }))
  .handler(async ({ data, context }) => {
    try {
      if (!data.runId) throw new Error("A run id is required.");
      const tenant = await resolveTenantContext(context.supabase, context.userId);
      const run = await loadRun(context.supabase, tenant.tenantId, data.runId);
      return { ok: true as const, run };
    } catch (error) {
      return runtimeError(error);
    }
  });

export const advanceAgentRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string; transition: { type: string; step?: string; value?: unknown; error?: string; approval?: unknown } }) => ({
    runId: String(input.runId ?? "").trim(),
    transition: input.transition,
  }))
  .handler(async ({ data, context }) => {
    try {
      const tenant = await resolveTenantContext(context.supabase, context.userId);
      const run = await loadRun(context.supabase, tenant.tenantId, data.runId);
      let transition: Parameters<typeof transitionAgentRun>[1];
      switch (data.transition.type) {
        case "start":
          transition = { type: "start" };
          break;
        case "resume":
          transition = { type: "resume" };
          break;
        case "cancel":
          transition = { type: "cancel" };
          break;
        case "fail":
          transition = { type: "fail", error: String(data.transition.error ?? "Unknown runtime failure.") };
          break;
        case "await_approval":
          transition = { type: "await_approval", approval: data.transition.approval ?? { status: "pending" } };
          break;
        case "complete_step": {
          const step = String(data.transition.step ?? "") as AgentRunStep;
          if (!["plan", "investigate", "policy", "approval", "execute", "verify"].includes(step)) {
            throw new Error("Invalid agent run step.");
          }
          transition = { type: "complete_step", step, value: data.transition.value };
          break;
        }
        default:
          throw new Error("Unsupported agent runtime transition.");
      }

      const updated = transitionAgentRun(run, transition);
      const persisted = toPersistedRun(updated);
      const { error } = await (context.supabase as any)
        .from("agent_runs")
        .update({
          status: persisted.status,
          current_step: persisted.current_step,
          plan: persisted.plan,
          policy_verdict: persisted.policy_verdict,
          approval: persisted.approval,
          execution: persisted.execution,
          verification: persisted.verification,
          error: persisted.error,
        })
        .eq("id", data.runId)
        .eq("tenant_id", tenant.tenantId);
      if (error) throw new Error(error.message);

      if (transition.type === "complete_step" && transition.step === "investigate" && transition.value !== undefined) {
        const { error: evidenceError } = await (context.supabase as any)
          .from("agent_run_evidence")
          .insert({ run_id: data.runId, tenant_id: tenant.tenantId, step: transition.step, evidence: transition.value });
        if (evidenceError) throw new Error(evidenceError.message);
      }

      return { ok: true as const, run: updated };
    } catch (error) {
      return runtimeError(error);
    }
  });
