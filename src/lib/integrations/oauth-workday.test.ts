import { describe, expect, it } from "vitest";
import { buildWorkdayAuthorizeUrl, WORKDAY_AUTH_BASE_URLS } from "./oauth-workday.server";

describe("Workday OAuth", () => {
  it("uses Workday regional authorization endpoints", () => {
    expect(WORKDAY_AUTH_BASE_URLS.us).toBe("https://auth.api.workday.com");
    expect(WORKDAY_AUTH_BASE_URLS.eu).toBe("https://api.eu.wcp.workday.com/auth");
  });

  it("builds authorization-code PKCE parameters", () => {
    const url = new URL(buildWorkdayAuthorizeUrl({ region: "us", clientId: "client-123", redirectUri: "https://cenops.example/callback", state: "state-123", challenge: "challenge-123" }));
    expect(url.origin).toBe("https://auth.api.workday.com");
    expect(url.pathname).toBe("/v1/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-123");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("state-123");
  });
});
