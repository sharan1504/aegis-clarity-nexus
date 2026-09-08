import { describe, expect, it } from "vitest";
import { eventForTransition, replayFromEvents, type AgentRunEvent } from "./agent-run-events";
import type { AgentRunState } from "./agent-runtime";

const run: AgentRunState = {
  runId: "run-1", tenantId: "tenant-1", agentKey: "agent-security", status: "planned", currentStep: "plan",
  input: "investigate security findings", plan: null, evidence: [], policyVerdict: null, approval: null,
  execution: null, verification: null, error: null, createdAt: "2026-09-09T00:00:00.000Z", updatedAt: "2026-09-09T00:00:00.000Z",
};

describe("agent run events", () => {
  it("records stage start and completion as deterministic transition facts", () => {
    const started = { ...run, status: "running" as const };
    expect(eventForTransition(run, started, { eventType: "stage_started", step: "plan" })).toEqual([
      { eventType: "stage_started", step: "plan" },
    ]);
    const planned = { ...started, plan: { steps: ["investigate"] }, currentStep: "investigate" as const };
    expect(eventForTransition(started, planned, { eventType: "stage_completed", step: "plan", payload: planned.plan })).toEqual([
      { eventType: "stage_completed", step: "plan", payload: planned.plan },
    ]);
  });

  it("adds approval request and resolution facts", () => {
    const waiting = { ...run, status: "waiting_approval" as const, currentStep: "approval" as const, approval: { status: "pending" } };
    const requested = eventForTransition({ ...run, status: "running" as const }, waiting, { eventType: "stage_completed", step: "policy" });
    expect(requested).toEqual(expect.arrayContaining([
      { eventType: "approval_requested", step: "approval", outcome: "pending", payload: waiting.approval },
    ]));
    const resumed = { ...waiting, status: "running" as const, approval: { status: "approved" } };
    expect(eventForTransition(waiting, resumed, { eventType: "approval_resolved", step: "approval", outcome: "approved", payload: resumed.approval })).toEqual(expect.arrayContaining([
      { eventType: "approval_resolved", step: "approval", outcome: "approved", payload: resumed.approval },
    ]));
  });

  it("replays events by immutable sequence rather than fetch order", () => {
    const make = (sequence: number): AgentRunEvent => ({ id: `e-${sequence}`, runId: "run-1", tenantId: "tenant-1", sequence, eventType: "stage_completed", step: "plan", actorId: null, provider: null, capabilityKey: null, outcome: "completed", payload: {}, occurredAt: `2026-09-09T00:0${sequence}:00.000Z` });
    expect(replayFromEvents([make(3), make(1), make(2)]).map((event) => event.sequence)).toEqual([1, 2, 3]);
  });
});
