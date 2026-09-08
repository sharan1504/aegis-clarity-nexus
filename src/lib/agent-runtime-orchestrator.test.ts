import { describe, expect, it } from "vitest";
import { createAgentRunState, type AgentRunClock } from "./agent-runtime";
import { orchestrateAgentRun } from "./agent-runtime-orchestrator";

const clock: AgentRunClock = { now: () => "2026-09-08T12:00:00.000Z" };
const createRun = () => createAgentRunState({ tenantId: "tenant-1", agentKey: "agent-security", input: "Investigate." }, { clock, idFactory: { create: () => "run-1" } });
const plan = { steps: ["investigate", "policy", "approval", "execute", "verify"] };

describe("agent runtime orchestrator", () => {
  it("runs plan, evidence and policy deterministically", () => {
    const result = orchestrateAgentRun(createRun(), [{ type: "plan", value: plan }, { type: "investigate", value: { findingId: "f-1" } }, { type: "policy", value: { verdict: "allow" } }], clock);
    expect(result.run.currentStep).toBe("approval");
    expect(result.run.plan).toEqual(plan);
    expect(result.run.evidence).toEqual([{ findingId: "f-1" }]);
    expect(result.run.policyVerdict).toEqual({ verdict: "allow" });
  });

  it("halts at approval and cannot execute past the gate", () => {
    const result = orchestrateAgentRun(createRun(), [{ type: "plan", value: plan }, { type: "investigate", value: { findingId: "f-1" } }, { type: "policy", value: { verdict: "allow" } }, { type: "await_approval", value: { status: "pending" } }, { type: "execute", value: { status: "should-not-run" } }], clock);
    expect(result.run.status).toBe("waiting_approval");
    expect(result.run.execution).toBeNull();
    expect(result.completedActions).toHaveLength(4);
  });

  it("requires explicit approval before execution and verification", () => {
    const result = orchestrateAgentRun(createRun(), [{ type: "plan", value: plan }, { type: "investigate", value: { findingId: "f-1" } }, { type: "policy", value: { verdict: "allow" } }, { type: "await_approval", value: { status: "pending" } }, { type: "approve", value: { status: "approved", approvedBy: "user-1" } }, { type: "execute", value: { status: "executed" } }, { type: "verify", value: { status: "verified" } }], clock);
    expect(result.run.status).toBe("completed");
    expect(result.run.approval).toEqual({ status: "approved", approvedBy: "user-1" });
    expect(result.run.verification).toEqual({ status: "verified" });
  });
});
