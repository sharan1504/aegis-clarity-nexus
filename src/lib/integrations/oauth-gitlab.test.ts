import { describe, expect, it } from "vitest";
import { buildGitLabAuthorizeUrl, GITLAB_SCOPES } from "./oauth-gitlab.server";

describe("GitLab OAuth", () => {
  it("builds an instance-scoped authorization URL", () => {
    const url = new URL(buildGitLabAuthorizeUrl({
      instanceUrl: "https://gitlab.example.com",
      clientId: "client-123",
      redirectUri: "https://cenops.example.com/integrations/gitlab/callback",
      state: "state-123",
    }));

    expect(url.origin).toBe("https://gitlab.example.com");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("redirect_uri")).toBe("https://cenops.example.com/integrations/gitlab/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("scope")).toBe(GITLAB_SCOPES.join(" "));
  });
});
