import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenantContext } from "@/lib/tenant-context.server";
import { orchestrateSecurityRun } from "./agent-runtime-orchestrator.server";
import { createAgentRunState, transitionAgentRun, type AgentRunState, type AgentRunStep } from "@/lib/agent-runtime";
import type { AgentRunEvent } from "@/lib/agent-run-events";

function runtimeError(error: unknown) { return { ok: false as const, error: error instanceof Error ? error.message : "Agent runtime operation failed." }; }
function toPersistedRun(run: AgentRunState) { return { id: run.runId.replace(/^run-/, ""), tenant_id: run.tenantId, agent_key: run.agentKey, status: run.status, current_step: run.currentStep, input: run.input, plan: run.plan, policy_verdict: run.policyVerdict, approval: run.approval, execution: run.execution, verification: run.verification, error: run.error }; }

async function loadRun(supabase: any, tenantId: string, runId: string): Promise<AgentRunState> {
  const { data, error } = await supabase.from("agent_runs").select("id, tenant_id, agent_key, status, current_step, input, plan, policy_verdict, approval, execution, verification, error, created_at, updated_at").eq("id", runId).eq("tenant_id", tenantId).single();
  if (error || !data) throw new Error(error?.message ?? "Agent run was not found.");
  const { data: evidenceRows, error: evidenceError } = await supabase.from("agent_run_evidence").select("evidence").eq("run_id", runId).eq("tenant_id", tenantId).order("created_at", { ascending: true });
  if (evidenceError) throw new Error(evidenceError.message);
  return { runId: `run-${data.id}`, tenantId: data.tenant_id, agentKey: data.agent_key, status: data.status, currentStep: data.current_step, input: data.input, plan: data.plan, evidence: (evidenceRows ?? []).map((row: { evidence: unknown }) => row.evidence), policyVerdict: data.policy_verdict, approval: data.approval, execution: data.execution, verification: data.verification, error: data.error, createdAt: data.created_at, updatedAt: data.updated_at };
}
async function loadEvents(supabase: any, tenantId: string, runId: string): Promise<AgentRunEvent[]> {
  const { data, error } = await supabase.from("agent_run_events").select("id, run_id, tenant_id, sequence, event_type, step, actor_id, provider, capability_key, outcome, payload, occurred_at").eq("run_id", runId).eq("tenant_id", tenantId).order("sequence", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AgentRunEvent[];
}
async function appendEvent(supabase: any, event: { runId: string; tenantId: string; actorId: string | null; eventType: AgentRunEvent["eventType"]; step?: AgentRunStep | null; provider?: string | null; capabilityKey?: string | null; outcome?: string | null; payload?: unknown }) {
  const { data: last } = await supabase.from("agent_run_events").select("sequence").eq("run_id", event.runId).eq("tenant_id", event.tenantId).order("sequence", { ascending: false }).limit(1).maybeSingle();
  const sequence = (last?.sequence ?? 0) + 1;
  const { error } = await supabase.from("agent_run_events").insert({ run_id: event.runId, tenant_id: event.tenantId, sequence, event_type: event.eventType, step: event.step ?? null, actor_id: event.actorId, provider: event.provider ?? null, capability_key: event.capabilityKey ?? null, outcome: event.outcome ?? null, payload: event.payload ?? {} });
  if (error) throw new Error(error.message);
}
async function persistRun(supabase: any, tenantId: string, run: AgentRunState) {
  const persisted = toPersistedRun(run);
  const { error } = await supabase.from("agent_runs").update({ status: persisted.status, current_step: persisted.current_step, plan: persisted.plan, policy_verdict: persisted.policy_verdict, approval: persisted.approval, execution: persisted.execution, verification: persisted.verification, error: persisted.error }).eq("id", persisted.id).eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}

export const createAgentRun = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { agentKey: string; input: string }) => ({ agentKey: String(input.agentKey ?? "").trim(), input: String(input.input ?? "").trim().slice(0, 6000) })).handler(async ({ data, context }) => {
  try {
    if (!data.agentKey) throw new Error("An agent key is required."); if (!data.input) throw new Error("A run input is required.");
    const tenant = await resolveTenantContext(context.supabase, context.userId); const run = createAgentRunState({ tenantId: tenant.tenantId, agentKey: data.agentKey, input: data.input }); const persisted = toPersistedRun(run);
    const { data: created, error } = await (context.supabase as any).from("agent_runs").insert({ tenant_id: persisted.tenant_id, agent_key: persisted.agent_key, status: persisted.status, current_step: persisted.current_step, input: persisted.input, plan: persisted.plan, policy_verdict: persisted.policy_verdict, approval: persisted.approval, execution: persisted.execution, verification: persisted.verification, error: persisted.error, created_by: context.userId }).select("id, created_at, updated_at").single();
    if (error || !created) throw new Error(error?.message ?? "Agent run could not be created.");
    await appendEvent(context.supabase, { runId: created.id, tenantId: tenant.tenantId, actorId: context.userId, eventType: "run_created", step: "plan", outcome: "planned", payload: { agentKey: run.agentKey, input: run.input } });
    return { ok: true as const, runId: created.id, status: run.status, currentStep: run.currentStep };
  } catch (error) { return runtimeError(error); }
});

export const getAgentRun = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { runId: string }) => ({ runId: String(input.runId ?? "").trim() })).handler(async ({ data, context }) => {
  try { if (!data.runId) throw new Error("A run id is required."); const tenant = await resolveTenantContext(context.supabase, context.userId); const run = await loadRun(context.supabase, tenant.tenantId, data.runId); return { ok: true as const, run, events: await loadEvents(context.supabase, tenant.tenantId, data.runId) }; } catch (error) { return runtimeError(error); }
});

export const orchestrateAgentRun = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { runId: string }) => ({ runId: String(input.runId ?? "").trim() })).handler(async ({ data, context }) => {
  try {
    if (!data.runId) throw new Error("A run id is required."); const tenant = await resolveTenantContext(context.supabase, context.userId); const run = await loadRun(context.supabase, tenant.tenantId, data.runId);
    if (run.agentKey !== "agent-security") throw new Error("This runtime vertical slice currently supports the Security Agent only.");
    const result = await orchestrateSecurityRun(context.supabase, context.userId, run); await persistRun(context.supabase, tenant.tenantId, result.run);
    if (result.run.evidence.length > run.evidence.length) await appendEvent(context.supabase, { runId: data.runId, tenantId: tenant.tenantId, actorId: context.userId, eventType: "stage_completed", step: "investigate", outcome: "completed", payload: result.run.evidence[result.run.evidence.length - 1] });
    if (result.run.policyVerdict !== null && run.policyVerdict === null) await appendEvent(context.supabase, { runId: data.runId, tenantId: tenant.tenantId, actorId: context.userId, eventType: "stage_completed", step: "policy", outcome: "evaluated", payload: result.run.policyVerdict });
    if (result.run.status === "waiting_approval" && run.status !== "waiting_approval") await appendEvent(context.supabase, { runId: data.runId, tenantId: tenant.tenantId, actorId: context.userId, eventType: "approval_requested", step: "approval", outcome: "pending", payload: result.run.approval });
    if (result.run.status === "failed" && run.status !== "failed") await appendEvent(context.supabase, { runId: data.runId, tenantId: tenant.tenantId, actorId: context.userId, eventType: "run_failed", step: run.currentStep, outcome: "failed", payload: { error: result.run.error } });
    return { ok: true as const, ...result, events: await loadEvents(context.supabase, tenant.tenantId, data.runId) };
  } catch (error) { return runtimeError(error); }
});

export const advanceAgentRun = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { runId: string; transition: { type: string; step?: string; value?: unknown; error?: string; approval?: unknown } }) => ({ runId: String(input.runId ?? "").trim(), transition: input.transition })).handler(async ({ data, context }) => {
  try {
    const tenant = await resolveTenantContext(context.supabase, context.userId); const run = await loadRun(context.supabase, tenant.tenantId, data.runId); let transition: Parameters<typeof transitionAgentRun>[1];
    switch (data.transition.type) {
      case "start": transition = { type: "start" }; break;
      case "resume": transition = { type: "resume" }; break;
      case "cancel": transition = { type: "cancel" }; break;
      case "fail": transition = { type: "fail", error: String(data.transition.error ?? "Unknown runtime failure.") }; break;
      case "await_approval": transition = { type: "await_approval", approval: data.transition.approval ?? { status: "pending" } }; break;
      case "complete_step": { const step = String(data.transition.step ?? "") as AgentRunStep; if (!["plan", "investigate", "policy", "approval", "execute", "verify"].includes(step)) throw new Error("Invalid agent run step."); transition = { type: "complete_step", step, value: data.transition.value }; break; }
      default: throw new Error("Unsupported agent runtime transition.");
    }
    const updated = transitionAgentRun(run, transition); await persistRun(context.supabase, tenant.tenantId, updated);
    const eventType = transition.type === "start" ? "stage_started" : transition.type === "await_approval" ? "approval_requested" : transition.type === "complete_step" ? "stage_completed" : transition.type === "fail" ? "run_failed" : transition.type === "cancel" ? "run_cancelled" : "approval_resolved";
    await appendEvent(context.supabase, { runId: data.runId, tenantId: tenant.tenantId, actorId: context.userId, eventType, step: transition.type === "complete_step" ? transition.step : updated.currentStep, outcome: updated.status, payload: transition.type === "fail" ? { error: updated.error } : transition.type === "complete_step" ? transition.value : transition.type === "await_approval" ? transition.approval : {} });
    return { ok: true as const, run: updated, events: await loadEvents(context.supabase, tenant.tenantId, data.runId) };
  } catch (error) { return runtimeError(error); }
});
