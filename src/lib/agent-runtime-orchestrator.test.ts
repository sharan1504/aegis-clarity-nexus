import { describe, expect, it } from "vitest";
import { createAgentRunState, type AgentRunClock } from "./agent-runtime";
import { orchestrateAgentRun } from "./agent-runtime-orchestrator";

const clock: AgentRunClock = { now: () => "2026-09-08T12:00:00.000Z" };

function createRun() {
  return createAgentRunState(
    { tenantId: "tenant-1", agentKey: "agent-security", input: "Investigate security findings." },
    { clock, idFactory: { create: () => "run-1" } },
  );
}

describe("agent runtime orchestrator", () => {
  it("advances investigation and policy without making an authorization decision", () => {
    const result = orchestrateAgentRun(createRun(), [
      { type: "investigate", value: { findingId: "f-1" } },
      { type: "policy", value: { verdict: "allow", evidence: ["high severity"] } },
    ], clock);

    expect(result.run.status).toBe("running");
    expect(result.run.currentStep).toBe("approval");
    expect(result.run.evidence).toEqual([{ findingId: "f-1" }]);
    expect(result.run.policyVerdict).toEqual({ verdict: "allow", evidence: ["high severity"] });
  });

  it("stops at approval and cannot execute past the gate", () => {
    const result = orchestrateAgentRun(createRun(), [
      { type: "investigate", value: { findingId: "f-1" } },
      { type: "policy", value: { verdict: "allow" } },
      { type: "await_approval", value: { status: "pending" } },
      { type: "execute", value: { status: "should-not-run" } },
    ], clock);

    expect(result.run.status).toBe("waiting_approval");
    expect(result.run.currentStep).toBe("approval");
    expect(result.run.execution).toBeNull();
    expect(result.completedActions).toHaveLength(3);
  });

  it("supports the trusted execution and verification stages after approval", () => {
    const result = orchestrateAgentRun(createRun(), [
      { type: "investigate", value: { findingId: "f-1" } },
      { type: "policy", value: { verdict: "allow" } },
      { type: "execute", value: { status: "executed" } },
      { type: "verify", value: { status: "verified" } },
    ], clock);

    expect(result.run.status).toBe("completed");
    expect(result.run.execution).toEqual({ status: "executed" });
    expect(result.run.verification).toEqual({ status: "verified" });
  });

  it("rejects out-of-order actions", () => {
    expect(() => orchestrateAgentRun(createRun(), [
      { type: "policy", value: { verdict: "allow" } },
    ], clock)).toThrow("Runtime expected investigate but received policy.");
  });
});
