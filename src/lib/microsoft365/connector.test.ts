import { describe, expect, it, vi, afterEach } from "vitest";
import { Microsoft365LicenseConnector } from "./connector.server";

afterEach(() => vi.restoreAllMocks());

describe("Microsoft365LicenseConnector", () => {
  it("authenticates, performs a real health read, syncs users/licenses/assignments and returns fresh evidence", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [{ id: "org-1" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [{ id: "org-1" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [{ id: "u-1", displayName: "Ada", userPrincipalName: "ada@example.com", accountEnabled: true, assignedLicenses: [{ skuId: "sku-1", disabledPlans: [] }] }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [{ skuId: "sku-1", skuPartNumber: "M365_E3", consumedUnits: 1, prepaidUnits: { enabled: 10 }, capabilityStatus: "Enabled", servicePlans: [] }] }), { status: 200 }));

    const connector = new Microsoft365LicenseConnector({ tenantId: "tenant-1", clientId: "client-1", clientSecret: "secret-1" });
    const result = await connector.sync();

    expect(result.users).toHaveLength(1);
    expect(result.licenses).toHaveLength(1);
    expect(result.assignments).toHaveLength(1);
    expect(result.snapshot.freshness).toBe("fresh");
    expect(result.snapshot.lastSuccessfulSyncAt).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("login.microsoftonline.com/tenant-1");
  });

  it("fails health when Graph authentication is rejected", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("denied", { status: 401 }));
    const connector = new Microsoft365LicenseConnector({ tenantId: "tenant-1", clientId: "client-1", clientSecret: "secret-1" });
    const result = await connector.health();
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Microsoft Entra token request failed");
  });
});
