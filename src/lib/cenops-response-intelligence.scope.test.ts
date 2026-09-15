import { describe, expect, it } from "vitest";
import { formatCenOpsResponse, normalizeCenOpsResponse } from "./cenops-response-intelligence";

describe("CenOps scope response guardrails", () => {
  it("returns a deterministic redirect for out_of_scope without operational scaffolding", () => {
    const response = normalizeCenOpsResponse({
      responseType: "operational",
      executiveSummary: "98*97 is 9506.",
      risks: [{ title: "fabricated risk", whyItMatters: "not applicable", impact: "not applicable", evidence: [], priority: 1 }],
      operationalContext: {
        businessImpact: ["fabricated impact"],
        verificationPlan: ["fabricated verification"],
      },
      evidence: [],
      confidence: 100,
    }, "out_of_scope");

    const answer = formatCenOpsResponse(response);
    expect(response.responseType).toBe("product");
    expect(response.confidence).toBe(0);
    expect(response.evidence).toEqual([]);
    expect(response.risks).toEqual([]);
    expect(response.operationalContext).toBeUndefined();
    expect(answer).toContain("outside CenOps scope");
    expect(answer).not.toContain("98*97");
    expect(answer).not.toContain("confidence");
    expect(answer).not.toContain("Business impact");
    expect(answer).not.toContain("Verification plan");
  });

  it("suppresses confidence whenever the normalized response has no evidence", () => {
    const response = normalizeCenOpsResponse({
      responseType: "operational",
      executiveSummary: "No connected evidence is available.",
      confidence: 100,
      evidence: [],
    }, "operational_analysis");

    expect(response.confidence).toBe(0);
    expect(formatCenOpsResponse(response)).not.toContain("confidence");
  });

  it("preserves confidence for evidence-backed operational responses", () => {
    const response = normalizeCenOpsResponse({
      responseType: "operational",
      executiveSummary: "An evidence-backed finding was detected.",
      confidence: 86,
      evidence: [{ source: "CenOps evidence", detail: "Authorized evidence" }],
    }, "operational_analysis");

    expect(response.confidence).toBe(86);
  });
});
