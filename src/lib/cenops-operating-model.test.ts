import { describe, expect, it } from "vitest";
import { deriveCenOpsOperationalContext, deriveCenOpsOperatingLoop } from "@/lib/cenops-operating-model";
import { normalizeCenOpsResponse } from "@/lib/cenops-response-intelligence";

describe("CenOps operating model", () => {
  it("maps an evidence-backed response through the governed operating loop", () => {
    const response = normalizeCenOpsResponse({
      responseType: "investigation",
      executiveSummary: "A service degradation is affecting a connected system.",
      keyFindings: [{ title: "Latency increased", detail: "Evidence shows elevated latency." }],
      risks: [{ title: "Customer impact", whyItMatters: "Service quality may decline.", impact: "Potential failed interactions.", evidence: ["Telemetry"], priority: 1, severity: "high" }],
      recommendations: [{ title: "Review remediation", rationale: "Validate the finding.", impact: "Restores service confidence.", risk: "Low", nextStep: "Review the evidence and approve if appropriate.", requiresApproval: true }],
      evidence: [{ source: "Telemetry", detail: "Latency increased.", timestamp: "2026-09-14T10:00:00Z" }],
      confidence: 88,
      actionRequired: true,
    }, "investigation");

    const loop = deriveCenOpsOperatingLoop(response);
    expect(loop.find((stage) => stage.key === "observe")?.status).toBe("complete");
    expect(loop.find((stage) => stage.key === "recommend")?.status).toBe("complete");
    expect(loop.find((stage) => stage.key === "approve")?.status).toBe("pending");
    expect(loop.find((stage) => stage.key === "learn")?.status).toBe("active");

    const context = deriveCenOpsOperationalContext(response);
    expect(context.affectedServices).toEqual(["Telemetry"]);
    expect(context.timeline).toHaveLength(1);
    expect(context.approvalState).toBe("pending");
    expect(context.rootCauseHypotheses).toEqual([]);
  });

  it("does not invent a root cause when evidence does not establish one", () => {
    const response = normalizeCenOpsResponse({ executiveSummary: "No root cause established.", evidence: [] }, "investigation");
    const context = deriveCenOpsOperationalContext(response);
    expect(context.rootCauseHypotheses).toEqual([]);
    expect(context.timeline).toEqual([]);
  });
});
