import type { UserClient } from "@/lib/execution/gateway.server";
import { runGovernedOperation, type ActorContext, type GovernedResult } from "@/lib/execution/gateway.server";
import { toJsonValue, type JsonValue } from "@/lib/json";

export interface AgentExecutionRequest { runId: string; changeRecordId: string; }
export interface ApprovedChangeContext { rowId: string; changeId: string; stage: string; agent: string | null; provider: string | null; executionMode: string | null; rollbackSteps: unknown; validations: unknown; }
export interface AgentExecutionReceipt { status: "executed"; runId: string; changeRecordId: string; changeId: string; provider: string | null; capability: string | null; startedAt: string; completedAt: string; verificationRequired: true; result: JsonValue; }
export type AgentCapabilityExecutor = (input: { supabase: UserClient; actor: ActorContext; runId: string; change: ApprovedChangeContext; run: Record<string, unknown> }) => Promise<unknown>;

function approvalDenial(approvals: Array<{ status: string }>): string | null {
  if (!approvals.length) return "No approval steps are attached to this change record.";
  if (approvals.some((approval) => approval.status === "rejected")) return "The linked change record contains a rejected approval step.";
  if (approvals.some((approval) => approval.status !== "approved")) return "Every approval step on the linked change record must be approved before execution.";
  return null;
}

async function loadApprovedChange(supabase: UserClient, tenantId: string, changeRecordId: string): Promise<ApprovedChangeContext> {
  const { data: change, error: changeError } = await (supabase as any).from("change_records").select("id, change_id, tenant_id, stage, agent, owner_team, execution_mode, rollback_steps, validations").eq("id", changeRecordId).eq("tenant_id", tenantId).single();
  if (changeError || !change) throw new Error(changeError?.message ?? "Linked change record was not found.");
  const { data: approvals, error: approvalError } = await (supabase as any).from("change_approvals").select("status").eq("change_record_id", change.id).eq("tenant_id", tenantId).order("position", { ascending: true });
  if (approvalError) throw new Error(approvalError.message);
  const denial = approvalDenial((approvals ?? []) as Array<{ status: string }>);
  if (denial) throw new Error(denial);
  if (change.stage !== "Ready to Execute") throw new Error(`Change ${change.change_id} is not ready to execute; current stage is ${change.stage}.`);
  const ownerTeam = typeof change.owner_team === "string" ? change.owner_team : "";
  const provider = ownerTeam.endsWith(" Operations") ? ownerTeam.slice(0, -" Operations".length).toLowerCase() : null;
  return { rowId: change.id, changeId: change.change_id, stage: change.stage, agent: change.agent ?? null, provider, executionMode: change.execution_mode ?? null, rollbackSteps: change.rollback_steps ?? [], validations: change.validations ?? [] };
}

/** Execute only after the existing Approval Center has produced a Ready to Execute change. */
export async function executeApprovedAgentRun(supabase: UserClient, actor: ActorContext, request: AgentExecutionRequest, executor: AgentCapabilityExecutor): Promise<GovernedResult<AgentExecutionReceipt>> {
  const { data: run, error: runError } = await (supabase as any).from("agent_runs").select("id, tenant_id, agent_key, status, current_step, input, plan, policy_verdict, approval, execution, verification").eq("id", request.runId).eq("tenant_id", actor.tenantId).single();
  if (runError || !run) return { ok: false, decision: "block", reasons: [runError?.message ?? "Agent run was not found."], requiredActions: ["Resolve the run reference and retry."] };
  if (run.current_step !== "execute") return { ok: false, decision: "block", reasons: [`Run ${request.runId} is at ${run.current_step}; execution is only valid at the execute stage.`], requiredActions: ["Advance the run through approval first."] };
  if (run.status !== "running") return { ok: false, decision: "block", reasons: [`Run ${request.runId} is ${run.status}; only a running run may execute.`], requiredActions: ["Resume the approved run before executing."] };
  let change: ApprovedChangeContext;
  try { change = await loadApprovedChange(supabase, actor.tenantId, request.changeRecordId); }
  catch (error) { return { ok: false, decision: "block", reasons: [error instanceof Error ? error.message : "The approval boundary could not be verified."], requiredActions: ["Resolve the linked change record approvals and retry."] }; }
  if (change.agent && change.agent !== run.agent_key) return { ok: false, decision: "block", reasons: ["The approved change record is bound to a different agent."], requiredActions: ["Use the change record created for this agent run."] };
  const startedAt = new Date().toISOString();
  return runGovernedOperation(supabase, actor, { origin: "agent", actionKey: `agent.${run.agent_key}.execute`, executionClass: "high_risk", agentKey: run.agent_key, provider: change.provider, capability: "agent.execute", hasChangeTicket: true, hasApproval: true, hasRollbackPlan: Array.isArray(change.rollbackSteps) && change.rollbackSteps.length > 0, changeRecordId: change.rowId }, async () => ({ status: "executed" as const, runId: request.runId, changeRecordId: change.rowId, changeId: change.changeId, provider: change.provider, capability: "agent.execute", startedAt, completedAt: new Date().toISOString(), verificationRequired: true as const, result: toJsonValue(await executor({ supabase, actor, runId: request.runId, change, run: run as Record<string, unknown> })) }));
}

export function unsupportedProviderExecutor(provider: string | null): AgentCapabilityExecutor { return async () => { throw new Error(`Provider mutation is not implemented for ${provider ?? "this provider"}; execution was denied rather than simulated.`); }; }
