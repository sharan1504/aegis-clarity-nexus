import { describe, expect, it } from "vitest";
import { buildSnowflakeAuthorizeUrl } from "./oauth-snowflake.server";

describe("Snowflake OAuth", () => {
  it("builds an account-specific authorization URL", () => {
    const url = new URL(buildSnowflakeAuthorizeUrl({ accountUrl: "https://example-org-account.snowflakecomputing.com", clientId: "client", redirectUri: "https://cenops.example/integrations/snowflake/callback", state: "state" }));
    expect(url.origin).toBe("https://example-org-account.snowflakecomputing.com");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("client");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state");
    expect(url.searchParams.get("scope")).toBe("session:role:PUBLIC");
  });
});
