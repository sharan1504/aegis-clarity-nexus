import { describe, expect, it } from "vitest";
import { buildZohoAuthorizeUrl, ZOHO_CRM_SCOPES } from "./oauth-zoho.server";

describe("Zoho CRM OAuth", () => {
  it("builds the documented offline authorization URL", () => {
    const url = new URL(buildZohoAuthorizeUrl({
      accountsUrl: "https://accounts.zoho.in",
      clientId: "client-123",
      redirectUri: "https://cenops.example.com/integrations/zoho/callback",
      state: "state-123",
    }));

    expect(url.origin).toBe("https://accounts.zoho.in");
    expect(url.pathname).toBe("/oauth/v2/auth");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("redirect_uri")).toBe("https://cenops.example.com/integrations/zoho/callback");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("scope")).toBe(ZOHO_CRM_SCOPES.join(","));
  });
});
