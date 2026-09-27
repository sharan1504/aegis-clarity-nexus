import { describe, expect, it } from "vitest";
import { boundCopilotContext, copilotEvidencePolicy, normalizeCopilotDepth } from "./copilot-runtime-policy";

describe("copilot runtime policy", () => {
  it("defaults omitted and unknown depth values to quick", () => {
    expect(normalizeCopilotDepth(undefined)).toBe("quick");
    expect(normalizeCopilotDepth("unexpected")).toBe("quick");
    expect(normalizeCopilotDepth("thorough")).toBe("thorough");
  });

  it("bounds context to the newest turns", () => {
    expect(boundCopilotContext([1, 2, 3, 4], 2)).toEqual([3, 4]);
  });

  it("keeps stable product questions evidence-free in both modes", () => {
    const intent = { productQuestion: true, requiresLiveEvidence: false };
    expect(copilotEvidencePolicy(intent, "quick")).toEqual({ workspace: false, providers: false });
    expect(copilotEvidencePolicy(intent, "thorough")).toEqual({ workspace: false, providers: false });
  });

  it("uses fast evidence for quick and expanded evidence for thorough", () => {
    const intent = { productQuestion: false, requiresLiveEvidence: true };
    expect(copilotEvidencePolicy(intent, "quick")).toEqual({ workspace: true, providers: false });
    expect(copilotEvidencePolicy(intent, "thorough")).toEqual({ workspace: true, providers: true });
  });
});