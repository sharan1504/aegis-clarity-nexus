import crypto from "node:crypto";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { assertStateMatchesActor, buildInstallUrl, createAppJwt, getGitHubAppConfig, isGitHubAppCredentials, mintInstallationToken, signInstallState, verifyInstallState, verifyInstallationRepositories, getInstallation, GITHUB_INSTALLATION_REPOSITORIES_PATH } from "./github-app.server";

describe("github app installation auth", () => {
  it("signs and verifies tenant/user-bound state and rejects expiry/tampering", () => {
    const secret = crypto.randomBytes(32);
    const now = Date.now();
    const token = signInstallState({ tenantId: "tenant-a", userId: "user-a" }, secret, now);
    expect(verifyInstallState(token, secret, now).tenantId).toBe("tenant-a");
    expect(() => verifyInstallState(token, secret, now + 10 * 60 * 1000 + 1)).toThrow(/expired/);
    expect(() => verifyInstallState(`${token}x`, secret, now)).toThrow(/signature/);
    expect(() => assertStateMatchesActor(verifyInstallState(token, secret, now), { tenantId: "tenant-b", userId: "user-a" })).toThrow(/different workspace/);
    expect(() => assertStateMatchesActor(verifyInstallState(token, secret, now), { tenantId: "tenant-a", userId: "user-b" })).toThrow(/different user/);
  });

  it("builds the GitHub App installation URL", () => {
    const url = buildInstallUrl("aegis-ai", "signed-state");
    expect(url).toBe("https://github.com/apps/aegis-ai/installations/new?state=signed-state");
  });

  it("creates an RS256 App JWT with the App ID as issuer", () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwt = createAppJwt({ appId: "12345", privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString() }, Date.parse("2026-09-10T00:00:00Z"));
    const [header, payload, signature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toMatchObject({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(payload, "base64url").toString()).iss).toBe("12345");
    const verify = crypto.createVerify("RSA-SHA256");
    verify.update(`${header}.${payload}`);
    verify.end();
    expect(verify.verify(publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  });

  it("requires App configuration on the server", () => {
    expect(() => getGitHubAppConfig({})).toThrow(/GITHUB_APP_ID/);
    expect(getGitHubAppConfig({ GITHUB_APP_ID: "123", GITHUB_APP_SLUG: "aegis-ai", GITHUB_APP_PRIVATE_KEY: "pem" })).toMatchObject({ appId: "123", slug: "aegis-ai", privateKey: "pem" });
  });

  describe("GitHub API helpers", () => {
    beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it("verifies the installation and app identity with the App JWT", async () => {
      const response = { id: 42, app_id: 123, repository_selection: "selected", account: { id: 77, login: "sharan1504", type: "User" } };
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, text: async () => JSON.stringify(response), headers: new Headers() });
      const result = await getInstallation("42", { appId: "123", slug: "aegis-ai", privateKey: crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString() });
      expect(result).toMatchObject({ installationId: "42", accountId: "77", accountLogin: "sharan1504", repositorySelection: "selected" });
      expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain("/app/installations/42");
    });

    it("mints an installation token and never persists it", async () => {
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, text: async () => JSON.stringify({ token: "ghs_test", expires_at: "2026-09-10T01:00:00Z" }), headers: new Headers() });
      const result = await mintInstallationToken("42", { appId: "123", slug: "aegis-ai", privateKey: crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString() });
      expect(result).toEqual({ token: "ghs_test", expiresAt: "2026-09-10T01:00:00Z" });
      expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain("/app/installations/42/access_tokens");
    });

    it("checks installation-scoped repository access", async () => {
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, text: async () => JSON.stringify({ total_count: 3 }), headers: new Headers() });
      await expect(verifyInstallationRepositories("ghs_test")).resolves.toEqual({ totalCount: 3 });
      expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain(`${GITHUB_INSTALLATION_REPOSITORIES_PATH}?per_page=1`);
    });
  });

  it("recognizes only GitHub App credentials", () => {
    expect(isGitHubAppCredentials({ authType: "github_app", installationId: "1" })).toBe(true);
    expect(isGitHubAppCredentials({ accessToken: "gho_old" })).toBe(false);
  });
});
