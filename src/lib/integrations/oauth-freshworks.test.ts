import { describe, expect, it } from "vitest";
import { buildFreshworksAuthorizeUrl, FRESHWORKS_SCOPES } from "./oauth-freshworks.server";

describe("Freshservice OAuth", () => {
  it("builds the documented organization-scoped authorization URL", () => {
    const url = new URL(buildFreshworksAuthorizeUrl({
      orgUrl: "https://acme.freshservice.com",
      clientId: "client-123",
      redirectUri: "https://cenops.example.com/integrations/freshworks/callback",
      state: "state-123",
    }));

    expect(url.origin).toBe("https://acme.freshservice.com");
    expect(url.pathname).toBe("/org/oauth/v2/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("redirect_uri")).toBe("https://cenops.example.com/integrations/freshworks/callback");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("scope")).toBe(FRESHWORKS_SCOPES.join(" "));
  });
});
