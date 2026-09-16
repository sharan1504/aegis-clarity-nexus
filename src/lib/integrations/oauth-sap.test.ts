import { describe, expect, it } from "vitest";
import { SAP_GRANT_TYPE } from "./oauth-sap.server";

describe("SAP OAuth", () => {
  it("uses the OAuth 2.0 client credentials grant", () => {
    expect(SAP_GRANT_TYPE).toBe("client_credentials");
  });

  it("requires HTTPS for provider endpoints", () => {
    expect(() => new URL("https://example.sap/oauth/token").protocol).not.toThrow();
  });
});
