import { describe, expect, it } from "vitest";
import { buildHubSpotAuthorizeUrl, HUBSPOT_SCOPES } from "./oauth-hubspot.server";

describe("HubSpot provider OAuth", () => {
  it("uses the vendor install endpoint and exact configured scopes", () => {
    const url = new URL(buildHubSpotAuthorizeUrl({ clientId: "client-123", redirectUri: "https://cenops.example/integrations/hubspot/callback", state: "state-123" }));
    expect(url.origin + url.pathname).toBe("https://app.hubspot.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("redirect_uri")).toBe("https://cenops.example/integrations/hubspot/callback");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("scope")).toBe(HUBSPOT_SCOPES.join(" "));
  });
});
