import { describe, expect, it } from "vitest";
import { evaluateAgentRun } from "./agent-evaluation";
import type { AgentRunEvent } from "./agent-run-events";
import type { AgentRunState } from "./agent-runtime";

const run: AgentRunState = {
  runId: "run-1",
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

const events: AgentRunEvent[] = [
  { id: "e1", runId: "1", tenantId: "tenant-1", sequence: 1, eventType: "run_created", step: "plan", actorId: "u1", provider: null, capabilityKey: null, outcome: "planned", payload: {}, occurredAt: "2026-09-09T00:00:00Z" },
  { id: "e2", runId: "1", tenantId: "tenant-1", sequence: 2, eventType: "stage_completed", step: "investigate", actorId: "u1", provider: "github", capabilityKey: "security_findings", outcome: "completed", payload: {}, occurredAt: "2026-09-09T00:00:10Z" },
  { id: "e3", runId: "1", tenantId: "tenant-1", sequence: 3, eventType: "stage_completed", step: "policy", actorId: "u1", provider: null, capabilityKey: null, outcome: "evaluated", payload: {}, occurredAt: "2026-09-09T00:00:20Z" },
  { id: "e4", runId: "1", tenantId: "tenant-1", sequence: 4, eventType: "approval_requested", step: "approval", actorId: "u1", provider: null, capabilityKey: null, outcome: "pending", payload: {}, occurredAt: "2026-09-09T00:00:30Z" },
];

const emptyEvidenceEvents: AgentRunEvent[] = [
  { id: "empty-1", runId: "1", tenantId: "tenant-1", sequence: 1, eventType: "run_created", step: "plan", actorId: "u1", provider: null, capabilityKey: null, outcome: "planned", payload: {}, occurredAt: "2026-09-09T00:00:00Z" },
];

describe("evaluateAgentRun", () => {
  it("passes the governed security run suite", () => {
    const result = evaluateAgentRun(run, events);
    expect(result.results.map((item) => ({ caseId: item.caseId, status: item.status }))).toEqual([
      { caseId: "normal-governed-run", status: "passed" },
      { caseId: "edge-empty-evidence", status: "failed" },
      { caseId: "failed-run-blocks", status: "passed" },
      { caseId: "approval-governance", status: "passed" },
      { caseId: "prompt-injection-boundary", status: "passed" },
    ]);
    expect(result.status).toBe("failed");
    expect(result.failed).toBe(1);
    expect(result.results).toHaveLength(5);
  });

  it("passes the empty-evidence boundary when no recommendation exists", () => {
    const emptyRun = { ...run, evidence: [], policyVerdict: { recommendations: [] } };
    const result = evaluateAgentRun(emptyRun, emptyEvidenceEvents);
    const edge = result.results.find((item) => item.caseId === "edge-empty-evidence");
    expect(edge?.status).toBe("passed");
  });

  it("fails the empty-evidence case when a recommendation is fabricated", () => {
    const fabricatedRun = { ...run, evidence: [] };
    const result = evaluateAgentRun(fabricatedRun, emptyEvidenceEvents);
    const edge = result.results.find((item) => item.caseId === "edge-empty-evidence");
    expect(edge?.status).toBe("failed");
  });

  it("detects execution before approval", () => {
    const unsafeEvents = [...events, { ...events[3], id: "e5", sequence: 5, eventType: "execution_attempted" as const, step: "execute" as const, outcome: "attempted" }];
    const result = evaluateAgentRun(run, unsafeEvents);
    expect(result.results.find((item) => item.caseId === "approval-governance")?.status).toBe("failed");
  });
});
