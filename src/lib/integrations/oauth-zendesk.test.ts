import { describe, expect, it } from "vitest";
import { buildZendeskAuthorizeUrl, ZENDESK_SCOPES } from "./oauth-zendesk.server";

describe("Zendesk provider OAuth", () => {
  it("uses the tenant Zendesk subdomain and required OAuth parameters", () => {
    const url = new URL(buildZendeskAuthorizeUrl({ subdomain: "acme", clientId: "client-123", redirectUri: "https://cenops.example/integrations/zendesk/callback", state: "state-123" }));
    expect(url.origin + url.pathname).toBe("https://acme.zendesk.com/oauth/authorizations/new");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("redirect_uri")).toBe("https://cenops.example/integrations/zendesk/callback");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("scope")).toBe(ZENDESK_SCOPES.join(" "));
  });

  it("can emit Zendesk PKCE parameters for public clients", () => {
    const url = new URL(buildZendeskAuthorizeUrl({ subdomain: "acme", clientId: "client-123", redirectUri: "https://cenops.example/integrations/zendesk/callback", state: "state-123", codeChallenge: "challenge" }));
    expect(url.searchParams.get("code_challenge")).toBe("challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});
