import { describe, expect, it } from "vitest";
import { buildAgentRunReplay } from "./agent-run-replay";
import type { AgentRunState } from "./agent-runtime";

const baseRun: AgentRunState = {
  runId: "run-123",
  tenantId: "tenant-1",
  agentKey: "agent-security",
  status: "waiting_approval",
  currentStep: "approval",
  input: "Find high security findings and recommend remediation.",
  plan: { steps: ["investigate", "policy", "approval"] },
  evidence: [{ provider: "github", findings: [{ id: "GH-1", severity: "high" }] }],
  policyVerdict: { recommendations: [{ findingId: "GH-1", action: "remediate" }] },
  approval: { status: "pending" },
  execution: null,
  verification: null,
  error: null,
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:01:00.000Z",
};

describe("buildAgentRunReplay", () => {
  it("builds an ordered lifecycle replay from persisted state", () => {
    const replay = buildAgentRunReplay(baseRun);
    expect(replay.events.map((event) => [event.step, event.state])).toEqual([
      ["plan", "completed"],
      ["investigate", "completed"],
      ["policy", "completed"],
      ["approval", "current"],
      ["execute", "pending"],
      ["verify", "pending"],
    ]);
  });

  it("connects provider evidence to policy, recommendation, and approval", () => {
    const replay = buildAgentRunReplay(baseRun);
    expect(replay.nodes.map((node) => node.id)).toEqual([
      "intent",
      "agent",
      "plan",
      "evidence-0",
      "policy",
      "recommendation",
      "approval",
    ]);
    expect(replay.edges).toEqual(expect.arrayContaining([
      { from: "agent", to: "evidence-0", label: "collects" },
      { from: "evidence-0", to: "policy", label: "evaluates" },
      { from: "policy", to: "recommendation", label: "recommends" },
      { from: "recommendation", to: "approval", label: "requires" },
    ]));
  });

  it("marks later stages blocked after a failure without inventing execution", () => {
    const replay = buildAgentRunReplay({ ...baseRun, status: "failed", currentStep: "execute", error: "No trusted write capability." });
    expect(replay.events.find((event) => event.step === "execute")?.state).toBe("blocked");
    expect(replay.events.find((event) => event.step === "verify")?.state).toBe("blocked");
    expect(replay.nodes.some((node) => node.id === "execution")).toBe(false);
  });
});
