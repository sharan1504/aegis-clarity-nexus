import { describe, expect, it } from "vitest";
import { normalizeEnvironmentMode } from "./settings.functions";

describe("environment mode settings", () => {
  it("normalizes only the supported modes", () => {
    expect(normalizeEnvironmentMode("demo")).toBe("demo");
    expect(normalizeEnvironmentMode("live")).toBe("live");
    expect(normalizeEnvironmentMode("unexpected")).toBe("live");
  });
});
