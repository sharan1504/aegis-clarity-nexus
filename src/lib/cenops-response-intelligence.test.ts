import { describe, expect, it } from "vitest";
import { normalizeCenOpsResponse, responseTypeForIntent, formatCenOpsResponse } from "./cenops-response-intelligence";

describe("CenOps response intelligence", () => {
  it("maps product intents to product responses", () => {
    expect(responseTypeForIntent("platform_overview")).toBe("product");
    expect(responseTypeForIntent("integration_how_to")).toBe("how_to");
    expect(responseTypeForIntent("integration_status")).toBe("status");
  });

  it("normalizes unsafe or malformed model output without inventing evidence", () => {
    const response = normalizeCenOpsResponse({
      executiveSummary: "Current posture requires review.",
      metrics: [{ label: "Open findings", value: "12", trend: "sideways" }],
      risks: [{ title: "Risk", whyItMatters: "Impact", impact: "Material", evidence: ["source"], priority: "bad" }],
      confidence: 140,
      actionRequired: "yes",
    }, "operational");

    expect(response.responseType).toBe("operational");
    expect(response.metrics[0].trend).toBeUndefined();
    expect(response.risks[0].priority).toBe(99);
    expect(response.confidence).toBe(100);
    expect(response.actionRequired).toBe(false);
  });

  it("renders executive-first output with progressive disclosure sections", () => {
    const response = normalizeCenOpsResponse({
      responseType: "executive",
      executiveSummary: "Two material risks require attention.",
      keyFindings: [{ title: "Finding", detail: "Evidence-backed finding", severity: "high", status: "Open" }],
      risks: [{ title: "Risk", whyItMatters: "Business impact", impact: "Potential disruption", evidence: ["Jira"], priority: 1, severity: "high" }],
      recommendations: [{ title: "Review", rationale: "Validate evidence", impact: "Lower risk", risk: "Low", nextStep: "Open the finding", requiresApproval: true }],
      evidence: [{ source: "Jira", detail: "Issue evidence" }],
      confidence: 92,
    }, "operational");

    const output = formatCenOpsResponse(response);
    expect(output).toContain("## Executive Summary");
    expect(output).toContain("## Key Findings");
    expect(output).toContain("## Risks");
    expect(output).toContain("## Recommended Next Steps");
    expect(output).toContain("## Evidence");
  });
});
