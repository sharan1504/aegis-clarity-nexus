import { describe, expect, it } from "vitest";
import { deriveCenOpsReasoning } from "@/lib/cenops-operational-reasoning";
import type { CenOpsResponse } from "@/lib/cenops-response-intelligence";

const base: CenOpsResponse = {
  responseType: "operational",
  executiveSummary: "Service health requires review.",
  keyFindings: [], metrics: [], risks: [], opportunities: [], recommendations: [],
  whatChanged: [], whatRequiresAttention: [], evidence: [], confidence: 90, actionRequired: false, followUps: [],
};

describe("deriveCenOpsReasoning", () => {
  it("prioritizes the highest-ranked material risk", () => {
    const result = deriveCenOpsReasoning({ ...base, risks: [
      { title: "Second risk", whyItMatters: "Less important", impact: "Moderate", evidence: ["e2"], priority: 2, severity: "medium" },
      { title: "Critical risk", whyItMatters: "Immediate exposure", impact: "High", evidence: ["e1"], priority: 1, severity: "critical" },
    ] });
    expect(result.priority).toBe("critical");
    expect(result.assessment).toContain("Critical risk");
    expect(result.businessImpact).toBe("High");
  });

  it("does not manufacture a risk when only opportunities exist", () => {
    const result = deriveCenOpsReasoning({ ...base, opportunities: [{ title: "License optimization", rationale: "Long-inactive entitlements may reduce spend", evidence: ["license evidence"] }] });
    expect(result.priority).toBe("low");
    expect(result.assessment).toContain("optimization opportunities");
  });

  it("always produces a verification step", () => {
    const result = deriveCenOpsReasoning(base);
    expect(result.verificationPlan.length).toBeGreaterThan(0);
  });
});
