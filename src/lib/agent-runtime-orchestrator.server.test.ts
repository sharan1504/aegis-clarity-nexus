import { describe, expect, it, vi } from "vitest";
import { createAgentRunState, type AgentRunClock } from "./agent-runtime";

vi.mock("@/lib/capabilities/github-router.server", () => ({ githubCapabilityRouter: { getSecurityFindings: vi.fn() } }));
vi.mock("@/lib/agents/security/analysis", () => ({ analyzeSecurityFindings: vi.fn() }));
vi.mock("@/lib/change-proposal.server", () => ({ createProposedChangeRecord: vi.fn() }));

describe("security runtime orchestrator", () => {
  const clock: AgentRunClock = { now: () => "2026-09-08T12:00:00.000Z" };

  it("collects routed evidence, evaluates policy, and waits for approval", async () => {
    const { githubCapabilityRouter } = await import("@/lib/capabilities/github-router.server");
    const { analyzeSecurityFindings } = await import("@/lib/agents/security/analysis");
    const { createProposedChangeRecord } = await import("@/lib/change-proposal.server");
    const { orchestrateSecurityRun } = await import("./agent-runtime-orchestrator.server");
    vi.mocked(githubCapabilityRouter.getSecurityFindings).mockResolvedValue({ tenantId: "tenant-1", agentKey: "agent-security", records: [{ integrationId: "github-1", findingId: "f-1" }], sources: [], warnings: [], evaluatedAt: clock.now(), freshness: "fresh", policies: { "github-1": { policy: { approval_required: true }, revision: { version: 1 } } } } as never);
    vi.mocked(analyzeSecurityFindings).mockReturnValue({ recommendations: [{ findingId: "f-1", severity: "high" }], excludedCount: 0, evaluatedCount: 1, exceededRepositoryCeiling: false } as never);
    vi.mocked(createProposedChangeRecord).mockResolvedValue({ id: "change-row-1", changeId: "AIG-1234", stage: "Team Approvals" } as never);
    const run = createAgentRunState({ tenantId: "tenant-1", agentKey: "agent-security", input: "Investigate." }, { clock, idFactory: { create: () => "run-1" } });
    const result = await orchestrateSecurityRun({} as never, "user-1", run, Date.parse(clock.now()));
    expect(result.run.status).toBe("waiting_approval");
    expect(result.run.execution).toBeNull();
    expect(result.recommendationCount).toBe(1);
    expect(vi.mocked(createProposedChangeRecord)).toHaveBeenCalledOnce();
  });

  it("fails closed when capability access is denied", async () => {
    const { githubCapabilityRouter } = await import("@/lib/capabilities/github-router.server");
    const { orchestrateSecurityRun } = await import("./agent-runtime-orchestrator.server");
    vi.mocked(githubCapabilityRouter.getSecurityFindings).mockResolvedValue({ denied: { reason: "not_connected", message: "GitHub is not connected." }, warnings: [], records: [], sources: [], policies: {}, tenantId: "tenant-1", agentKey: "agent-security", evaluatedAt: clock.now(), freshness: "unavailable" } as never);
    const run = createAgentRunState({ tenantId: "tenant-1", agentKey: "agent-security", input: "Investigate." }, { clock, idFactory: { create: () => "run-2" } });
    const result = await orchestrateSecurityRun({} as never, "user-1", run, Date.parse(clock.now()));
    expect(result.run.status).toBe("failed");
    expect(result.run.error).toBe("GitHub is not connected.");
  });
});
