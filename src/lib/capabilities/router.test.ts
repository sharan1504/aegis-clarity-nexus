import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Tables } from "./__fixtures__/fake-supabase";

// The privileged (service-role) client is mocked so we can assert it is only
// ever reached AFTER authorization succeeds.
const privileged = vi.hoisted(() => ({
  calls: [] as string[],
  data: {} as Tables,
}));

vi.mock("@/integrations/supabase/client.server", async () => {
  const { createFakeSupabase } = await import("./__fixtures__/fake-supabase");
  return {
    get supabaseAdmin() {
      const client = createFakeSupabase(privileged.data);
      return {
        from(table: string) {
          privileged.calls.push(table);
          return client.from(table);
        },
      };
    },
  };
});

const { authorizeCapabilityAccess } = await import("./authorization.server");
const { capabilityRouter } = await import("./router.server");

const NOW = new Date("2026-08-17T12:00:00.000Z").getTime();
const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";
const USER_A = "user-a";
const CAP_LICENSE = "cap-license";
const CAP_QUEUE = "cap-queue";

function baseTables(overrides: Partial<Tables> = {}): Tables {
  return {
    profiles: [
      { id: USER_A, tenant_id: TENANT_A },
      { id: "user-b", tenant_id: TENANT_B },
    ],
    user_roles: [
      { user_id: USER_A, tenant_id: TENANT_A, role: "admin" },
      { user_id: "user-b", tenant_id: TENANT_B, role: "admin" },
    ],
    agent_definitions: [{ agent_key: "agent-license" }, { agent_key: "agent-routing" }],
    capabilities: [
      { id: CAP_LICENSE, capability_key: "license_inventory" },
      { id: CAP_QUEUE, capability_key: "queue_inventory" },
    ],
    agent_capabilities: [
      { agent_key: "agent-license", capability_id: CAP_LICENSE, id: "ac-1" },
      { agent_key: "agent-routing", capability_id: CAP_QUEUE, id: "ac-2" },
    ],
    provider_capabilities: [
      { provider: "genesys", capability_id: CAP_LICENSE, implemented: true },
      { provider: "genesys", capability_id: CAP_QUEUE, implemented: true },
    ],
    integrations: [
      {
        id: "int-genesys-a",
        tenant_id: TENANT_A,
        provider: "genesys",
        display_name: "Genesys Cloud",
        status: "connected",
        health_status: "healthy",
        last_sync_at: new Date(NOW - 12 * 60_000).toISOString(),
        is_mock: false,
        active_snapshot_id: "snap-1",
        active_sync_run_id: "sync-1",
      },
      {
        id: "int-genesys-b",
        tenant_id: TENANT_B,
        provider: "genesys",
        display_name: "Other tenant Genesys",
        status: "connected",
        health_status: "healthy",
        last_sync_at: new Date(NOW - 60_000).toISOString(),
        is_mock: false,
        active_snapshot_id: "snap-b",
        active_sync_run_id: "sync-b",
      },
    ],
    agent_integration_bindings: [
      {
        id: "bind-1",
        tenant_id: TENANT_A,
        agent_key: "agent-license",
        integration_id: "int-genesys-a",
        capability_id: CAP_LICENSE,
        enabled: true,
        is_mock: false,
        policy: { inactivity_threshold_days: 90 },
        policy_version: 3,
        policy_updated_at: "2026-08-01T00:00:00.000Z",
        policy_updated_by: USER_A,
      },
    ],
    ...overrides,
  };
}

const genesysData: Tables = {
  genesys_user_licenses: [
    {
      tenant_id: TENANT_A,
      integration_id: "int-genesys-a",
      genesys_user_id: "gu-1",
      license_id: "lic-1",
      is_current: true,
      snapshot_id: "snap-1",
      sync_id: "sync-1",
      synced_at: new Date(NOW - 12 * 60_000).toISOString(),
    },
  ],
  genesys_licenses: [
    {
      tenant_id: TENANT_A,
      integration_id: "int-genesys-a",
      license_id: "lic-1",
      name: "Genesys Cloud CX 3",
      is_current: true,
    },
  ],
  genesys_users: [
    {
      tenant_id: TENANT_A,
      integration_id: "int-genesys-a",
      genesys_user_id: "gu-1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      state: "active",
      last_login_at: new Date(NOW - 200 * 86_400_000).toISOString(),
      date_created: "2020-01-01T00:00:00.000Z",
      is_current: true,
    },
  ],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asClient = (c: unknown) => c as any;

beforeEach(() => {
  privileged.calls = [];
  privileged.data = genesysData;
});

describe("capability router authorization", () => {
  it("authorizes a bound agent + capability and resolves the tenant server-side", async () => {
    const client = createFakeSupabase(baseTables());
    const decision = await authorizeCapabilityAccess(
      asClient(client),
      USER_A,
      "agent-license",
      "license_inventory",
      { now: NOW },
    );
    expect(decision.ok).toBe(true);
    expect(decision.tenantId).toBe(TENANT_A);
    expect(decision.sources).toHaveLength(1);
    expect(decision.sources[0]?.policy.inactivity_threshold_days).toBe(90);
    expect(decision.sources[0]?.policyRevision.version).toBe(3);
  });

  it("denies an unbound integration", async () => {
    const client = createFakeSupabase(baseTables({ agent_integration_bindings: [] }));
    const decision = await authorizeCapabilityAccess(
      asClient(client),
      USER_A,
      "agent-license",
      "license_inventory",
      { now: NOW },
    );
    expect(decision.ok).toBe(false);
    expect(decision.reason).toBe("integration_not_bound");
  });

  it("denies a disabled binding", async () => {
    const tables = baseTables();
    tables["agent_integration_bindings"]![0]!["enabled"] = false;
    const decision = await authorizeCapabilityAccess(
      asClient(createFakeSupabase(tables)),
      USER_A,
      "agent-license",
      "license_inventory",
      { now: NOW },
    );
    expect(decision.ok).toBe(false);
    expect(decision.reason).toBe("binding_disabled");
  });

  it("denies a capability the agent does not declare", async () => {
    const decision = await authorizeCapabilityAccess(
      asClient(createFakeSupabase(baseTables())),
      USER_A,
      "agent-license",
      "queue_inventory",
      { now: NOW },
    );
    expect(decision.ok).toBe(false);
    expect(decision.reason).toBe("capability_not_assigned_to_agent");
  });

  it("denies a capability the provider does not implement", async () => {
    const tables = baseTables({
      provider_capabilities: [{ provider: "genesys", capability_id: CAP_QUEUE, implemented: true }],
    });
    const decision = await authorizeCapabilityAccess(
      asClient(createFakeSupabase(tables)),
      USER_A,
      "agent-license",
      "license_inventory",
      { now: NOW },
    );
    expect(decision.ok).toBe(false);
    expect(decision.reason).toBe("capability_not_supported_by_provider");
  });

  it("denies an unhealthy integration", async () => {
    const tables = baseTables();
    tables["integrations"]![0]!["health_status"] = "error";
    const decision = await authorizeCapabilityAccess(
      asClient(createFakeSupabase(tables)),
      USER_A,
      "agent-license",
      "license_inventory",
      { now: NOW },
    );
    expect(decision.ok).toBe(false);
    expect(decision.reason).toBe("integration_unhealthy");
  });

  it("never lets tenant A reach a tenant B integration, even when it is bound", async () => {
    const tables = baseTables();
    // A forged binding pointing at another tenant's integration.
    tables["agent_integration_bindings"]!.push({
      id: "bind-forged",
      tenant_id: TENANT_A,
      agent_key: "agent-license",
      integration_id: "int-genesys-b",
      capability_id: CAP_LICENSE,
      enabled: true,
      is_mock: false,
      policy: {},
      policy_version: 1,
      policy_updated_at: null,
      policy_updated_by: null,
    });
    const decision = await authorizeCapabilityAccess(
      asClient(createFakeSupabase(tables)),
      USER_A,
      "agent-license",
      "license_inventory",
      { now: NOW },
    );
    expect(decision.sources.map((s) => s.integrationId)).toEqual(["int-genesys-a"]);
    expect(decision.denials.some((d) => d.integrationId === "int-genesys-b")).toBe(true);
  });

  it("denies an account without a tenant or without a role", async () => {
    const noTenant = await authorizeCapabilityAccess(
      asClient(createFakeSupabase(baseTables({ profiles: [] }))),
      USER_A,
      "agent-license",
      "license_inventory",
      { now: NOW },
    );
    expect(noTenant.reason).toBe("no_tenant");

    const noRole = await authorizeCapabilityAccess(
      asClient(createFakeSupabase(baseTables({ user_roles: [] }))),
      USER_A,
      "agent-license",
      "license_inventory",
      { now: NOW },
    );
    expect(noRole.reason).toBe("no_role");
  });

  it("denies an unknown agent or unknown capability", async () => {
    const client = createFakeSupabase(baseTables());
    expect(
      (
        await authorizeCapabilityAccess(
          asClient(client),
          USER_A,
          "agent-does-not-exist",
          "license_inventory",
          { now: NOW },
        )
      ).reason,
    ).toBe("agent_not_found");
    expect(
      (
        await authorizeCapabilityAccess(
          asClient(createFakeSupabase(baseTables())),
          USER_A,
          "agent-license",
          "cost_inventory",
          { now: NOW },
        )
      ).reason,
    ).toBe("capability_unknown");
  });
});

describe("capability router execution", () => {
  it("returns provider facts with provenance and freshness, and no policy verdicts", async () => {
    const result = await capabilityRouter.getLicenseInventory(
      asClient(createFakeSupabase(baseTables())),
      USER_A,
      "agent-license",
      { now: NOW },
    );

    expect(result.tenantId).toBe(TENANT_A);
    expect(result.records).toHaveLength(1);
    const record = result.records[0]!;

    // Facts only — no connector-side classification.
    expect(record).not.toHaveProperty("usageStatus");
    expect(record).not.toHaveProperty("optimizationCandidate");
    expect(record.lastActivityAt).toBeTruthy();
    expect(record.status).toBe("active");

    // Provenance.
    expect(record.provenance).toMatchObject({
      provider: "genesys",
      integrationId: "int-genesys-a",
      sourceSystem: "Genesys Cloud",
      source: "genesys_user_licenses",
      snapshotId: "snap-1",
      syncId: "sync-1",
    });

    // Freshness.
    expect(record.provenance.freshness).toBe("fresh");
    expect(result.freshness).toBe("fresh");
    expect(result.sources[0]).toMatchObject({
      integrationId: "int-genesys-a",
      snapshotId: "snap-1",
      freshness: "fresh",
      policyVersion: 3,
      recordCount: 1,
    });
    expect(result.policies["int-genesys-a"]?.policy.inactivity_threshold_days).toBe(90);
  });

  it("marks a stale source as stale rather than hiding it", async () => {
    const tables = baseTables();
    tables["integrations"]![0]!["last_sync_at"] = new Date(NOW - 9 * 3_600_000).toISOString();
    const result = await capabilityRouter.getLicenseInventory(
      asClient(createFakeSupabase(tables)),
      USER_A,
      "agent-license",
      { now: NOW },
    );
    expect(result.freshness).toBe("stale");
  });

  it("never touches the privileged client when authorization fails", async () => {
    const result = await capabilityRouter.getLicenseInventory(
      asClient(createFakeSupabase(baseTables({ agent_integration_bindings: [] }))),
      USER_A,
      "agent-license",
      { now: NOW },
    );
    expect(result.denied?.reason).toBe("integration_not_bound");
    expect(result.records).toEqual([]);
    expect(privileged.calls).toEqual([]);
  });

  it("uses the privileged client only after authorization succeeds", async () => {
    await capabilityRouter.getLicenseInventory(
      asClient(createFakeSupabase(baseTables())),
      USER_A,
      "agent-license",
      { now: NOW },
    );
    expect(privileged.calls).toContain("genesys_user_licenses");
  });

  it("cannot be pointed at another tenant or integration by its caller", async () => {
    // The router's only inputs are the verified userId and an agentKey; there is
    // no parameter through which a caller (or an LLM tool call) can pass a
    // tenant id, integration id or provider name.
    expect(capabilityRouter.getLicenseInventory.length).toBeLessThanOrEqual(4);
    const result = await capabilityRouter.getLicenseInventory(
      asClient(createFakeSupabase(baseTables())),
      "user-b", // tenant B user, no bindings of their own
      "agent-license",
      { now: NOW },
    );
    expect(result.records).toEqual([]);
    expect(result.tenantId).not.toBe(TENANT_A);
  });
});

describe("binding topology", () => {
  it("supports one integration bound to multiple agents with one credential set", async () => {
    const tables = baseTables();
    tables["agent_integration_bindings"]!.push({
      id: "bind-2",
      tenant_id: TENANT_A,
      agent_key: "agent-routing",
      integration_id: "int-genesys-a",
      capability_id: CAP_QUEUE,
      enabled: true,
      is_mock: false,
      policy: { inactivity_threshold_days: 30 },
      policy_version: 1,
      policy_updated_at: null,
      policy_updated_by: null,
    });

    const license = await authorizeCapabilityAccess(
      asClient(createFakeSupabase(tables)),
      USER_A,
      "agent-license",
      "license_inventory",
      { now: NOW },
    );
    const routing = await authorizeCapabilityAccess(
      asClient(createFakeSupabase(tables)),
      USER_A,
      "agent-routing",
      "queue_inventory",
      { now: NOW },
    );

    expect(license.sources[0]?.integrationId).toBe("int-genesys-a");
    expect(routing.sources[0]?.integrationId).toBe("int-genesys-a");
    // Same integration row => same stored OAuth credential set, no duplication.
    expect(license.sources[0]?.integrationId).toBe(routing.sources[0]?.integrationId);
  });

  it("supports one agent bound to multiple integrations, each with its own policy", async () => {
    const tables = baseTables();
    tables["integrations"]!.push({
      id: "int-m365-a",
      tenant_id: TENANT_A,
      provider: "microsoft365",
      display_name: "Microsoft 365",
      status: "connected",
      health_status: "healthy",
      last_sync_at: new Date(NOW - 30 * 60_000).toISOString(),
      is_mock: false,
      active_snapshot_id: null,
      active_sync_run_id: null,
    });
    tables["provider_capabilities"]!.push({
      provider: "microsoft365",
      capability_id: CAP_LICENSE,
      implemented: false,
    });
    tables["agent_integration_bindings"]!.push({
      id: "bind-3",
      tenant_id: TENANT_A,
      agent_key: "agent-license",
      integration_id: "int-m365-a",
      capability_id: CAP_LICENSE,
      enabled: true,
      is_mock: false,
      policy: { inactivity_threshold_days: 60 },
      policy_version: 1,
      policy_updated_at: null,
      policy_updated_by: null,
    });

    const result = await capabilityRouter.getLicenseInventory(
      asClient(createFakeSupabase(tables)),
      USER_A,
      "agent-license",
      { now: NOW },
    );

    expect(Object.keys(result.policies).sort()).toEqual(["int-genesys-a", "int-m365-a"]);
    expect(result.policies["int-genesys-a"]?.policy.inactivity_threshold_days).toBe(90);
    expect(result.policies["int-m365-a"]?.policy.inactivity_threshold_days).toBe(60);
    // Unimplemented provider is reported, not crashed on — and needs no agent change.
    const m365 = result.sources.find((s) => s.integrationId === "int-m365-a");
    expect(m365?.implemented).toBe(false);
    expect(m365?.warning).toBeTruthy();
  });
});
