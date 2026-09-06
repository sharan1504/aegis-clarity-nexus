import { describe, expect, it } from "vitest";
import { isDemoMode } from "./environment-mode";

describe("environment mode", () => {
  it("only treats demo as demo", () => {
    expect(isDemoMode("demo")).toBe(true);
    expect(isDemoMode("live")).toBe(false);
  });
});
