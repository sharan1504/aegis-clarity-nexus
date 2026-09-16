import { describe, expect, it } from "vitest";
import { CONTRACT_IMPLEMENTED_PROVIDERS, deriveConnectorStatus, isContractImplementedProvider } from "./provider-contract";

describe("provider contract integrity", () => {
  it("includes Microsoft 365 but not catalog-only providers", () => {
    expect(CONTRACT_IMPLEMENTED_PROVIDERS.has("m365")).toBe(true);
    expect(isContractImplementedProvider("m365")).toBe(true);
    expect(isContractImplementedProvider("aws")).toBe(false);
    expect(isContractImplementedProvider("azure")).toBe(false);
  });

  it("does not mark a credential-only connection as connected", () => {
    expect(deriveConnectorStatus({ provider: "m365", configuredStatus: "connected", credentialPresent: true, health: { status: "unknown", checkedAt: null, error: null }, sync: { status: "never", lastAttemptedAt: null, lastSuccessfulAt: null, recordCount: 0, error: null } })).toBe("pending");
    expect(deriveConnectorStatus({ provider: "m365", configuredStatus: "connected", credentialPresent: true, health: { status: "healthy", checkedAt: new Date().toISOString(), error: null }, sync: { status: "success", lastAttemptedAt: new Date().toISOString(), lastSuccessfulAt: new Date().toISOString(), recordCount: 1, error: null } })).toBe("connected");
  });
});
