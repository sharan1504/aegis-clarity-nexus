import type { UserClient } from "@/lib/execution/gateway.server";
import {
  runGovernedOperation,
  type ActorContext,
  type GovernedResult,
} from "@/lib/execution/gateway.server";

export interface AgentExecutionRequest {
  runId: string;
  changeRecordId: string;
}

export interface ApprovedChangeContext {
  rowId: string;
  changeId: string;
  stage: string;
  agent: string | null;
  provider: string | null;
  executionMode: string | null;
  rollbackSteps: unknown;
  validations: unknown;
}

export interface AgentExecutionReceipt {
  status: "executed";
  runId: string;
  changeRecordId: string;
  changeId: string;
  provider: string | null;
  capability: string | null;
  startedAt: string;
  completedAt: string;
  verificationRequired: true;
  result: unknown;
}

export type AgentCapabilityExecutor = (input: {
  supabase: UserClient;
  actor: ActorContext;
  runId: string;
  change: ApprovedChangeContext;
  run: Record<string, unknown>;
}) => Promise<unknown>;

function highestApprovalDenial(approvals: Array<{ status: string }>): string | null {
  if (!approvals.length) return "No approval steps are attached to this change record.";
  const rejected = approvals.some((approval) => approval.status === "rejected");
  if (rejected) return "The linked change record contains a rejected approval step.";
  const pending = approvals.some((approval) => approval.status !== "approved");
  if (pending) return "Every approval step on the linked change record must be approved before execution.";
  return null;
}

async function loadApprovedChange(
  supabase: UserClient,
  tenantId: string,
  changeRecordId: string,
): Promise<{ change: ApprovedChangeContext; approvals: Array<{ status: string }> }> {
  const { data: change, error: changeError } = await (supabase as any)
    .from("change_records")
    .select("id, change_id, tenant_id, stage, agent, target_provider, provider, execution_mode, rollback_steps, validations")
    .eq("id", changeRecordId)
    .eq("tenant_id", tenantId)
    .single();

  if (changeError || !change) {
    throw new Error(changeError?.message ?? "Linked change record was not found.");
  }

  const { data: approvals, error: approvalError } = await (supabase as any)
    .from("change_approvals")
    .select("status")
    .eq("change_record_id", change.id)
    .eq("tenant_id", tenantId)
    .order("position", { ascending: true });

  if (approvalError) throw new Error(approvalError.message);

  const denial = highestApprovalDenial((approvals ?? []) as Array<{ status: string }>);
  if (denial) throw new Error(denial);
  if (change.stage !== "Ready to Execute") {
    throw new Error(`Change ${change.change_id} is not ready to execute; current stage is ${change.stage}.`);
  }

  return {
    change: {
      rowId: change.id,
      changeId: change.change_id,
      stage: change.stage,
      agent: change.agent ?? null,
      provider: change.target_provider ?? change.provider ?? null,
      executionMode: change.execution_mode ?? null,
      rollbackSteps: change.rollback_steps ?? [],
      validations: change.validations ?? [],
    },
    approvals: (approvals ?? []) as Array<{ status: string }>,
  };
}

/**
 * Executes an already-approved agent run through the same governance gate used
 * by UI/MCP/capability calls. No caller-supplied approval is trusted: the
 * change record and its approval rows are re-read inside the tenant boundary.
 *
 * The executor is deliberately injected so provider mutations can be added one
 * capability at a time without weakening this boundary. Unsupported writes must
 * fail closed rather than silently becoming successful no-ops.
 */
export async function executeApprovedAgentRun(
  supabase: UserClient,
  actor: ActorContext,
  request: AgentExecutionRequest,
  executor: AgentCapabilityExecutor,
): Promise<GovernedResult<AgentExecutionReceipt>> {
  const { data: run, error: runError } = await (supabase as any)
    .from("agent_runs")
    .select("id, tenant_id, agent_key, status, current_step, input, plan, policy_verdict, approval, execution, verification")
    .eq("id", request.runId)
    .eq("tenant_id", actor.tenantId)
    .single();

  if (runError || !run) {
    return {
      ok: false,
      decision: "block",
      reasons: [runError?.message ?? "Agent run was not found."],
      requiredActions: ["Resolve the run reference and retry."],
    };
  }

  if (run.current_step !== "execute") {
    return {
      ok: false,
      decision: "block",
      reasons: [`Run ${request.runId} is at ${run.current_step}; execution is only valid at the execute stage.`],
      requiredActions: ["Advance the run through plan, investigation, policy and approval first."],
    };
  }

  if (run.status !== "running") {
    return {
      ok: false,
      decision: "block",
      reasons: [`Run ${request.runId} is ${run.status}; only a running run may execute.`],
      requiredActions: ["Resume the approved run before executing."],
    };
  }

  let change;
  try {
    change = await loadApprovedChange(supabase, actor.tenantId, request.changeRecordId);
  } catch (error) {
    return {
      ok: false,
      decision: "block",
      reasons: [error instanceof Error ? error.message : "The approval boundary could not be verified."],
      requiredActions: ["Resolve the linked change record approvals and retry."],
    };
  }

  if (change.change.agent && change.change.agent !== run.agent_key) {
    return {
      ok: false,
      decision: "block",
      reasons: ["The approved change record is bound to a different agent."],
      requiredActions: ["Use a change record created for the current agent run."],
    };
  }

  const startedAt = new Date().toISOString();
  const governed = await runGovernedOperation(
    supabase,
    actor,
    {
      origin: "agent",
      actionKey: `agent.${run.agent_key}.execute`,
      executionClass: "write",
      agentKey: run.agent_key,
      provider: change.change.provider,
      capability: typeof run.plan === "object" && run.plan && "capability" in run.plan
        ? String((run.plan as Record<string, unknown>).capability ?? "agent.execute")
        : "agent.execute",
      hasChangeTicket: true,
      hasApproval: true,
      hasRollbackPlan: Array.isArray(change.change.rollbackSteps) && change.change.rollbackSteps.length > 0,
      changeRecordId: change.change.rowId,
    },
    async () => {
      const providerResult = await executor({
        supabase,
        actor,
        runId: request.runId,
        change: change.change,
        run: run as Record<string, unknown>,
      });

      const completedAt = new Date().toISOString();
      const receipt: AgentExecutionReceipt = {
        status: "executed",
        runId: request.runId,
        changeRecordId: change.change.rowId,
        changeId: change.change.changeId,
        provider: change.change.provider,
        capability: "agent.execute",
        startedAt,
        completedAt,
        verificationRequired: true,
        result: providerResult,
      };
      return receipt;
    },
  );

  return governed;
}

export function unsupportedProviderExecutor(provider: string | null): AgentCapabilityExecutor {
  return async () => {
    throw new Error(`Provider mutation is not implemented for ${provider ?? "this provider"}; execution was denied rather than simulated.`);
  };
}
