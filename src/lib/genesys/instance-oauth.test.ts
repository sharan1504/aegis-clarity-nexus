import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildAuthorizeUrl, createPkcePair } from "./instance-oauth.server";

describe("Genesys OAuth PKCE", () => {
  it("creates an RFC 7636 S256 verifier/challenge pair", () => {
    const { verifier, challenge } = createPkcePair();
    const expected = crypto.createHash("sha256").update(verifier).digest("base64url");
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toBe(expected);
  });

  it("includes the PKCE challenge in the Genesys authorization request", () => {
    const url = new URL(buildAuthorizeUrl({
      clientId: "client-id",
      redirectUri: "https://example.com/integrations/genesys/callback",
      state: "state-123",
      region: "mypurecloud.com",
      codeChallenge: "challenge-123",
    }));

    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://example.com/integrations/genesys/callback");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-123");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});
