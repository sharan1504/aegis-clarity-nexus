import { describe, expect, it } from "vitest";

import { LICENSE_AGENT_KEY, LICENSE_OPERATIONS, parseLicenseFilters } from "./types";

describe("License Agent contracts", () => {
  it("uses the existing agent key and exposes only read-only operations", () => {
    expect(LICENSE_AGENT_KEY).toBe("agent-license");
    expect(LICENSE_OPERATIONS).toEqual([
      "get_license_summary",
      "get_license_usage",
      "get_license_assignments",
      "get_unused_license_candidates",
      "get_user_license_details",
    ]);
  });

  it("accepts supported filters", () => {
    expect(
      parseLicenseFilters(
        { licenseName: "CX3", userEmail: "user@example.com" },
        ["licenseName", "userEmail"],
      ),
    ).toEqual({
      ok: true,
      filters: {
        licenseName: "CX3",
        userEmail: "user@example.com",
      },
    });
  });

  it("rejects unsupported filters", () => {
    const result = parseLicenseFilters({ provider: "Genesys" }, ["licenseId"]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0].field).toBe("provider");
    }
  });

  it("rejects malformed email filters", () => {
    const result = parseLicenseFilters({ userEmail: "not-an-email" }, ["userEmail"]);

    expect(result.ok).toBe(false);
  });

  it("rejects oversized filter values", () => {
    const result = parseLicenseFilters({ licenseName: "x".repeat(321) }, ["licenseName"]);

    expect(result.ok).toBe(false);
  });

  it("rejects array input instead of treating it as filters", () => {
    const result = parseLicenseFilters(["CX3"], ["licenseName"]);

    expect(result.ok).toBe(false);
  });
});
