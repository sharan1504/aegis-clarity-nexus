import { describe, expect, it, vi } from "vitest";

import { claimProviderSyncCapacity, releaseProviderSyncCapacity } from "./provider-governor.server";

describe("fleet provider governor client", () => {
  it("requests shared tenant/provider rate and concurrency budgets", async () => {
    const rpc = vi.fn(async () => ({ data: { acquired: true, token: "lease-1", active: 1 }, error: null }));
    const result = await claimProviderSyncCapacity({ rpc }, {
      tenantId: "tenant-1", provider: "GitHub", connectionId: "connection-1", runId: "run-1",
    });
    expect(result).toEqual({ acquired: true, token: "lease-1", active: 1 });
    expect(rpc).toHaveBeenCalledWith("claim_provider_sync_capacity", {
      p_tenant_id: "tenant-1", p_provider: "GitHub", p_connection_id: "connection-1",
      p_run_id: "run-1", p_requests_per_minute: 10, p_max_concurrency: 2, p_lease_seconds: 900,
    });
  });

  it("preserves backpressure retry guidance", async () => {
    const rpc = vi.fn(async () => ({ data: { acquired: false, reason: "rate_limit", retryAfterSeconds: 17 }, error: null }));
    await expect(claimProviderSyncCapacity({ rpc }, {
      tenantId: "tenant-1", provider: "jira", connectionId: "connection-1",
    })).resolves.toEqual({ acquired: false, reason: "rate_limit", retryAfterSeconds: 17 });
  });

  it("fails closed if the shared governor RPC fails", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "database unavailable" } }));
    await expect(claimProviderSyncCapacity({ rpc }, {
      tenantId: "tenant-1", provider: "jira", connectionId: "connection-1",
    })).rejects.toThrow("Unable to claim shared provider capacity: database unavailable");
  });

  it("releases only the supplied lease token", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    await releaseProviderSyncCapacity({ rpc }, "lease-1");
    expect(rpc).toHaveBeenCalledWith("release_provider_sync_capacity", { p_token: "lease-1" });
  });
});
