import { describe, expect, it } from "vitest";
import { classifyDataProvenance, dataProvenanceLabel } from "@/lib/data-provenance";

describe("data provenance", () => {
  it("classifies all-demo records as demo", () => {
    expect(classifyDataProvenance({ demoFlags: [true, true], connected: true })).toBe("demo");
  });

  it("classifies all-live records as live", () => {
    expect(classifyDataProvenance({ demoFlags: [false, false], connected: true })).toBe("live");
  });

  it("never labels mixed records as live", () => {
    expect(classifyDataProvenance({ demoFlags: [true, false], connected: true })).toBe("mixed");
  });

  it("uses offline when there are no records and no connection", () => {
    expect(classifyDataProvenance({ demoFlags: [], connected: false })).toBe("offline");
  });

  it("uses live when there are no records but the live source is connected", () => {
    expect(classifyDataProvenance({ demoFlags: [], connected: true })).toBe("live");
  });

  it("maps provenance to the UI label", () => {
    expect(dataProvenanceLabel("demo")).toBe("Demo");
    expect(dataProvenanceLabel("mixed")).toBe("Mixed");
    expect(dataProvenanceLabel("live")).toBe("Live");
    expect(dataProvenanceLabel("offline")).toBe("Offline");
  });
});
