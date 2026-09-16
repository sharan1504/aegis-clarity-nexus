import { describe, expect, it } from "vitest";
import { buildSapAuthorizeUrl } from "./oauth-sap.server";

describe("SAP OAuth", () => {
  it("builds an authorization-code request from tenant-specific SAP endpoints", () => {
    const url = new URL(buildSapAuthorizeUrl({
      authorizationUrl: "https://tenant.authentication.example/oauth/authorize",
      clientId: "sap-client",
      redirectUri: "https://cenops.example/integrations/sap/callback",
      state: "state-123",
      scope: "read:users read:systems",
    }));
    expect(url.origin).toBe("https://tenant.authentication.example");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("sap-client");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe("https://cenops.example/integrations/sap/callback");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("scope")).toBe("read:users read:systems");
  });
});
