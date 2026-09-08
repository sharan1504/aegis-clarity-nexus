import { describe, expect, it } from "vitest";

import { createAgentRunState, transitionAgentRun, type AgentRunClock } from "./agent-runtime";

const clock: AgentRunClock = { now: () => "2026-09-08T12:00:00.000Z" };

describe("agent runtime", () => {
  it("creates a deterministic initial run state with injectable dependencies", () => {
    const run = createAgentRunState(
      { tenantId: "tenant-1", agentKey: "agent-license", input: "Find unused licenses." },
      { clock, idFactory: { create: () => "run-1" } },
    );

    expect(run).toMatchObject({
      runId: "run-1",
      tenantId: "tenant-1",
      agentKey: "agent-license",
      status: "planned",
      currentStep: "plan",
      evidence: [],
      createdAt: "2026-09-08T12:00:00.000Z",
    });
  });

  it("enforces the governed lifecycle and records evidence", () => {
    let run = createAgentRunState(
      { tenantId: "tenant-1", agentKey: "agent-license", input: "Find unused licenses." },
      { clock, idFactory: { create: () => "run-1" } },
    );

    run = transitionAgentRun(run, { type: "start" }, clock);
    run = transitionAgentRun(run, { type: "complete_step", step: "plan", value: { steps: ["inspect"] } }, clock);
    run = transitionAgentRun(run, { type: "complete_step", step: "investigate", value: { id: "license-1" } }, clock);
    run = transitionAgentRun(run, { type: "complete_step", step: "policy", value: { verdict: "allow" } }, clock);
    run = transitionAgentRun(run, { type: "await_approval", approval: { status: "pending" } }, clock);

    expect(run.status).toBe("waiting_approval");
    expect(run.evidence).toEqual([{ id: "license-1" }]);

    run = transitionAgentRun(run, { type: "resume" }, clock);
    run = transitionAgentRun(run, { type: "complete_step", step: "approval", value: { status: "approved" } }, clock);
    run = transitionAgentRun(run, { type: "complete_step", step: "execute", value: { status: "executed" } }, clock);
    run = transitionAgentRun(run, { type: "complete_step", step: "verify", value: { status: "verified" } }, clock);

    expect(run.status).toBe("completed");
    expect(run.verification).toEqual({ status: "verified" });
  });

  it("rejects invalid lifecycle transitions", () => {
    const run = createAgentRunState(
      { tenantId: "tenant-1", agentKey: "agent-security", input: "Investigate findings." },
      { clock, idFactory: { create: () => "run-1" } },
    );

    expect(() => transitionAgentRun(run, { type: "resume" }, clock)).toThrow("Run cannot resume from planned.");
    expect(() => transitionAgentRun(run, { type: "complete_step", step: "plan" }, clock)).toThrow("Only a running run");
  });
});
