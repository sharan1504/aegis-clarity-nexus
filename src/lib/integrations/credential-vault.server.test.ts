import { describe, expect, it, vi, afterEach } from "vitest";

describe("credential encryption health", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("reports only validity and never returns the key", async () => {
    vi.stubEnv("AEGIS_CREDENTIAL_ENCRYPTION_KEY", "a".repeat(64));
    const { getCredentialEncryptionHealth } = await import("./credential-vault.server");
    expect(getCredentialEncryptionHealth()).toEqual({ configured: true, valid: true });
    vi.stubEnv("AEGIS_CREDENTIAL_ENCRYPTION_KEY", "invalid");
    expect(getCredentialEncryptionHealth()).toEqual({ configured: true, valid: false });
    vi.stubEnv("AEGIS_CREDENTIAL_ENCRYPTION_KEY", "");
    expect(getCredentialEncryptionHealth()).toEqual({ configured: false, valid: false });
  });
});
