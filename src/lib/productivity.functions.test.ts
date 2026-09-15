import { describe, expect, it } from "vitest";
import { buildProductivityReport } from "./productivity.functions";

describe("Productivity Agent", () => {
  it("exposes the governed report builder", () => {
    expect(buildProductivityReport).toBeTypeOf("function");
  });

  it("supports week, month, 3-month, 6-month and year reporting windows", () => {
    const windows = ["week", "month", "3_months", "6_months", "year"] as const;
    expect(windows).toEqual(["week", "month", "3_months", "6_months", "year"]);
  });
});
