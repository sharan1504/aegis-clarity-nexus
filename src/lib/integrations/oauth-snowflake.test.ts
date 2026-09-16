import { describe, expect, it } from "vitest";
import { buildSnowflakeAuthorizeUrl } from "./oauth-snowflake.server";

describe("Snowflake OAuth", () => {
  it("builds an account-specific authorization URL with S256 PKCE", () => {
    const url = new URL(buildSnowflakeAuthorizeUrl({
      accountUrl: "https://example-org-account.snowflakecomputing.com",
      clientId: "client",
      redirectUri: "https://cenops.example/integrations/snowflake/callback",
      state: "state",
      codeChallenge: "challenge",
    }));
    expect(url.origin).toBe("https://example-org-account.snowflakecomputing.com");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("client");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state");
    expect(url.searchParams.get("scope")).toBe("session:role:PUBLIC");
    expect(url.searchParams.get("code_challenge")).toBe("challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("allows a caller to select the Snowflake role scope", () => {
    const url = new URL(buildSnowflakeAuthorizeUrl({
      accountUrl: "https://example-org-account.snowflakecomputing.com",
      clientId: "client",
      redirectUri: "https://cenops.example/integrations/snowflake/callback",
      state: "state",
      scope: "session:role:ANALYST refresh_token",
      codeChallenge: "challenge",
    }));
    expect(url.searchParams.get("scope")).toBe("session:role:ANALYST refresh_token");
  });
});
