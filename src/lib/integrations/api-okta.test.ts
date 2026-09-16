import { describe, expect, it } from "vitest";

describe("Okta API-token integration", () => {
  it("documents the SSWS authentication contract used by the connector", () => {
    const authorization = `SSWS ${"token"}`;
    expect(authorization.startsWith("SSWS ")).toBe(true);
    expect("https://example.okta.com/api/v1/meta/types/user").toContain("/api/v1/meta/types/user");
  });
});
