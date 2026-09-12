import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ActorContext, GovernedOperation, UserClient } from "@/lib/execution/gateway.server";
import type { GuardrailVerdict } from "@/lib/guardrails/evaluate";

vi.mock("@/lib/execution/gateway.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/execution/gateway.server")>("@/lib/execution/gateway.server");
  return { ...actual, runGovernedOperation: vi.fn() };
});

import { runGovernedOperation } from "@/lib/execution/gateway.server";
import { executeApprovedAgentRun } from "./agent-execution-handoff.server";

const gate = vi.mocked(runGovernedOperation);

function builder(result: { data?: unknown; error?: { message: string } | null }) {
  const value = {
    select: vi.fn(() => value),
    eq: vi.fn(() => value),
    order: vi.fn(() => value),
    single: vi.fn(async () => result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return value;
}

function supabaseFor(run: unknown, change: unknown, approvals: unknown[]) {
  const runs = builder({ data: run, error: null });
  const changes = builder({ data: change, error: null });
  const approvalRows = builder({ data: approvals, error: null });
  return { from: vi.fn((table: string) => table === "agent_runs" ? runs : table === "change_records" ? changes : approvalRows) } as never;
}

const actor: ActorContext = { userId: "user-1", tenantId: "tenant-1", roles: ["manager"], actorRole: "manager" };
const run = { id: "run-1", tenant_id: "tenant-1", agent_key: "agent-security", status: "running", current_step: "execute", input: "Investigate", plan: { capability: "security_findings" }, policy_verdict: {}, approval: { changeRecordId: "change-row-1" }, execution: null, verification: null };
const change = { id: "change-row-1", change_id: "AIG-1234", tenant_id: "tenant-1", stage: "Ready to Execute", agent: "agent-security", owner_team: "GitHub Operations", execution_mode: "Manual", rollback_steps: ["Restore prior state"], validations: [] };

beforeEach(() => gate.mockReset());

describe("executeApprovedAgentRun", () => {
  it("blocks a run before the execute stage", async () => {
    const result = await executeApprovedAgentRun(supabaseFor({ ...run, current_step: "approval" }, change, [{ status: "approved" }]), actor, { runId: "run-1", changeRecordId: "change-row-1" }, vi.fn());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.requiredActions.join(" ")).toContain("approval");
    expect(gate).not.toHaveBeenCalled();
  });

  it("blocks pending approvals and never invokes the provider executor", async () => {
    const executor = vi.fn();
    const result = await executeApprovedAgentRun(supabaseFor(run, change, [{ status: "approved" }, { status: "pending" }]), actor, { runId: "run-1", changeRecordId: "change-row-1" }, executor);
    expect(result.ok).toBe(false);
    expect(executor).not.toHaveBeenCalled();
    expect(gate).not.toHaveBeenCalled();
  });

  it("validates agent binding before execution", async () => {
    const result = await executeApprovedAgentRun(supabaseFor(run, { ...change, agent: "agent-cost" }, [{ status: "approved" }]), actor, { runId: "run-1", changeRecordId: "change-row-1" }, vi.fn());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons[0]).toContain("different agent");
    expect(gate).not.toHaveBeenCalled();
  });

  it("passes only fully approved changes through the governance gate", async () => {
    const executor = vi.fn().mockResolvedValue({ provider: "github", mutation: "test" });
    gate.mockImplementationOnce(async (_supabase: UserClient, _actor: ActorContext, _operation: GovernedOperation, fn: (verdict: GuardrailVerdict) => unknown) => { const verdict: GuardrailVerdict = { decision: "allow", allowed: true, matched: [], reasons: [], requiredActions: [], maxRecords: null, redactFields: [], escalateTo: null, requiresHuman: false, evaluatedAt: "2026-09-12T00:00:00.000Z" }; return { ok: true, result: await fn(verdict), verdict, capped: false }; });
    const result = await executeApprovedAgentRun(supabaseFor(run, change, [{ status: "approved" }]), actor, { runId: "run-1", changeRecordId: "change-row-1" }, executor);
    expect(result.ok).toBe(true);
    expect(executor).toHaveBeenCalledOnce();
    expect(gate).toHaveBeenCalledOnce();
    const operation = gate.mock.calls[0][2];
    expect(operation.executionClass).toBe("high_risk");
    expect(operation.hasApproval).toBe(true);
    expect(operation.changeRecordId).toBe("change-row-1");
  });
});
