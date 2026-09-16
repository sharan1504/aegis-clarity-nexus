import { describe, expect, it } from "vitest";
import { CONFLUENCE_SCOPES, buildConfluenceAuthorizeUrl } from "./oauth-confluence.server";

describe("Confluence OAuth", () => {
  it("builds the Atlassian 3LO authorization URL with Confluence scopes", () => {
    const url = new URL(buildConfluenceAuthorizeUrl({
      clientId: "confluence-client",
      redirectUri: "https://cenops.example.com/integrations/confluence/callback",
      state: "state-123",
    }));

    expect(url.origin).toBe("https://auth.atlassian.com");
    expect(url.pathname).toBe("/authorize");
    expect(url.searchParams.get("audience")).toBe("api.atlassian.com");
    expect(url.searchParams.get("client_id")).toBe("confluence-client");
    expect(url.searchParams.get("redirect_uri")).toBe("https://cenops.example.com/integrations/confluence/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("scope")).toBe(CONFLUENCE_SCOPES.join(" "));
  });
});
