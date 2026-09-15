import { describe, expect, it } from "vitest";
import { classifyCenOpsIntent } from "./cenops-ai-intent";

describe("CenOps productivity intent routing", () => {
  it("recognizes productivity analysis requests as live-evidence questions", () => {
    const result = classifyCenOpsIntent("How many tickets did Shyam handle this month?");
    expect(result.intent).toBe("productivity_analysis");
    expect(result.productQuestion).toBe(false);
    expect(result.requiresLiveEvidence).toBe(true);
  });

  it("recognizes report-generation requests", () => {
    const result = classifyCenOpsIntent("Generate a productivity report for Akash for the last 3 months");
    expect(result.intent).toBe("productivity_report");
    expect(result.requiresLiveEvidence).toBe(true);
  });

  it("does not confuse product documentation with a productivity data request", () => {
    const result = classifyCenOpsIntent("What does the Productivity Agent do?");
    expect(result.intent).toBe("agent_explanation");
    expect(result.productQuestion).toBe(true);
  });
});
