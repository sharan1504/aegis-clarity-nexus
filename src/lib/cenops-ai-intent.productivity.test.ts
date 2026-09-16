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

  it("recognizes natural platform-overview wording", () => {
    expect(classifyCenOpsIntent("What this platform is about?").intent).toBe("platform_overview");
    expect(classifyCenOpsIntent("What is this platform about?").intent).toBe("platform_overview");
    expect(classifyCenOpsIntent("What does this platform do?").intent).toBe("platform_overview");
    expect(classifyCenOpsIntent("What problem does CenOps solve?").intent).toBe("platform_overview");
    expect(classifyCenOpsIntent("Why would I use CenOps?").intent).toBe("platform_overview");
  });

  it.each([
    "tell me what is 98*97",
    "what is the capital of France",
    "write me a poem",
  ])("classifies general or unrelated requests as out_of_scope: %s", (message) => {
    const result = classifyCenOpsIntent(message);
    expect(result.intent).toBe("out_of_scope");
    expect(result.productQuestion).toBe(true);
    expect(result.requiresLiveEvidence).toBe(false);
  });

  it("preserves representative platform operational and product routing", () => {
    expect(classifyCenOpsIntent("What is CenOps?").intent).toBe("platform_overview");
    expect(classifyCenOpsIntent("What integrations are supported?").intent).toBe("integration_discovery");
    expect(classifyCenOpsIntent("What is happening with current incidents?").intent).toBe("operational_analysis");
    expect(classifyCenOpsIntent("Investigate why the incident started").intent).toBe("investigation");
  });
});
