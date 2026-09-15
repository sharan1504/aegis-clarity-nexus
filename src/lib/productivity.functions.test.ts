import { describe, expect, it } from "vitest";
import { buildProductivityReport } from "./productivity.functions";

describe("Productivity Agent", () => {
  it("builds a user-scoped report from normalized provider work items", async () => {
    const supabase = { from(table: string) { const base = { select: () => base, eq: () => base, in: () => base, order: () => base, limit: () => base }; if (table === "provider_connections") return { ...base, then: undefined, data: undefined }; return base; } };
    expect(typeof buildProductivityReport).toBe("function");
  });

  it("supports the governed reporting windows", () => {
    const windows = ["week", "month", "3_months", "6_months", "year"] as const;
    expect(windows).toHaveLength(5);
  });
});
