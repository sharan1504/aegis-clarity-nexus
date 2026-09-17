import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type Tables } from "./__fixtures__/fake-supabase";

const connector = vi.hoisted(() => ({ sync: vi.fn() }));
vi.mock("@/lib/microsoft365/connector.server", () => ({ Microsoft365LicenseConnector: class { sync = connector.sync; } }));

const privileged = vi.hoisted(() => ({ data: {} as Tables }));
vi.mock("@/integrations/supabase/client.server", async () => {
  const { createFakeSupabase } = await import("./__fixtures__/fake-supabase");
  return { get supabaseAdmin() { return createFakeSupabase(privileged.data); } };
});

const { capabilityRouter } = await import("./router.server");
const NOW = new Date("2026-08-17T12:00:00.000Z").getTime();
const tenant = "tenant-a";
const user = "user-a";
const cap = "cap-license";

function baseTables(): Tables {
  return {
    profiles: [{ id: user, tenant_id: tenant }],
    user_roles: [{ user_id: user, tenant_id: tenant, role: "admin" }],
    agent_definitions: [{ agent_key: "agent-license" }],
    capabilities: [{ id: cap, capability_key: "license_inventory" }],
    agent_capabilities: [{ agent_key: "agent-license", capability_id: cap, id: "agent-cap-license" }],
    provider_capabilities: [
      { provider: "genesys", capability_id: cap, implemented: true },
      { provider: "microsoft365", capability_id: cap, implemented: true },
      { provider: "m365", capability_id: cap, implemented: true },
      { provider: "slack", capability_id: cap, implemented: false },
    ],
    integrations: [
      { id: "genesys-1", tenant_id: tenant, provider: "genesys", display_name: "Genesys Production", status: "connected", health_status: "healthy", last_sync_at: new Date(NOW - 5 * 60_000).toISOString(), is_mock: false, active_snapshot_id: "snap-g", active_sync_run_id: "sync-g" },
      { id: "m365-1", tenant_id: tenant, provider: "microsoft365", display_name: "M365 Production", status: "connected", health_status: "healthy", last_sync_at: new Date(NOW - 5 * 60_000).toISOString(), is_mock: false, active_snapshot_id: null, active_sync_run_id: null },
      { id: "m365-2", tenant_id: tenant, provider: "m365", display_name: "M365 Staging", status: "connected", health_status: "healthy", last_sync_at: new Date(NOW - 5 * 60_000).toISOString(), is_mock: false, active_snapshot_id: null, active_sync_run_id: null },
    ],
    agent_integration_bindings: [
      { id: "bind-g", tenant_id: tenant, agent_key: "agent-license", integration_id: "genesys-1", capability_id: cap, enabled: true, is_mock: false, policy: {}, policy_version: 1, policy_updated_at: null, policy_updated_by: null },
      { id: "bind-m1", tenant_id: tenant, agent_key: "agent-license", integration_id: "m365-1", capability_id: cap, enabled: true, is_mock: false, policy: {}, policy_version: 1, policy_updated_at: null, policy_updated_by: null },
      { id: "bind-m2", tenant_id: tenant, agent_key: "agent-license", integration_id: "m365-2", capability_id: cap, enabled: true, is_mock: false, policy: {}, policy_version: 1, policy_updated_at: null, policy_updated_by: null },
    ],
    genesys_user_licenses: [{ tenant_id: tenant, integration_id: "genesys-1", genesys_user_id: "g-user", license_id: "g-license", is_current: true, snapshot_id: "snap-g", sync_id: "sync-g", synced_at: new Date(NOW - 5 * 60_000).toISOString() }],
    genesys_licenses: [{ tenant_id: tenant, integration_id: "genesys-1", license_id: "g-license", name: "Genesys Cloud CX 3", is_current: true }],
    genesys_users: [{ tenant_id: tenant, integration_id: "genesys-1", genesys_user_id: "g-user", name: "Ada Lovelace", email: "ada@example.com", state: "active", last_login_at: "2026-08-10T12:00:00.000Z", date_created: "2020-01-01T00:00:00.000Z", is_current: true }],
    provider_connections: [
      { id: "pc-m365-1", integration_id: "m365-1", tenant_id: tenant, provider: "microsoft365", encrypted_credentials: "encrypted-1" },
      { id: "pc-m365-2", integration_id: "m365-2", tenant_id: tenant, provider: "m365", encrypted_credentials: "encrypted-2" },
    ],
  };
}

beforeEach(() => {
  privileged.data = baseTables();
  connector.sync.mockReset();
  connector.sync.mockResolvedValue({
    users: [{ externalId: "m-user", name: "Grace Hopper", email: "grace@example.com", status: "active", metadata: {} }],
    licenses: [{ externalId: "m-license", name: "Microsoft 365 E5", status: "active" }],
    assignments: [{ userExternalId: "m-user", licenseExternalId: "m-license", status: "active", lastActivityAt: "2026-08-09T12:00:00.000Z", metadata: {} }],
    snapshot: { syncedAt: "2026-08-17T11:00:00.000Z", lastSuccessfulSyncAt: "2026-08-17T11:00:00.000Z", freshness: "fresh" },
  });
});

const client = () => createFakeSupabase(privileged.data) as any;

describe("global license capability routing", () => {
  it("works with Genesys only", async () => {
    const tables = baseTables();
    tables.integrations = tables.integrations?.filter((row) => row.provider === "genesys");
    tables.agent_integration_bindings = tables.agent_integration_bindings?.filter((row) => row.integration_id === "genesys-1");
    const result = await capabilityRouter.getLicenseInventory(createFakeSupabase(tables) as any, user, "agent-license", { now: NOW });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ provider: "genesys", integrationId: "genesys-1", entitlementId: "g-license" });
  });

  it("works with Microsoft 365 only", async () => {
    const tables = baseTables();
    tables.integrations = tables.integrations?.filter((row) => row.provider !== "genesys");
    tables.agent_integration_bindings = tables.agent_integration_bindings?.filter((row) => row.integration_id !== "genesys-1");
    const result = await capabilityRouter.getLicenseInventory(createFakeSupabase(tables) as any, user, "agent-license", { now: NOW });
    expect(result.denied).toBeUndefined();
    expect(result.records).toHaveLength(2);
    expect(new Set(result.records.map((row) => row.provider))).toEqual(new Set(["microsoft365"]));
    expect(new Set(result.records.map((row) => row.integrationId))).toEqual(new Set(["m365-1", "m365-2"]));
  });

  it("aggregates Genesys plus both M365 instances", async () => {
    const result = await capabilityRouter.getLicenseInventory(client(), user, "agent-license", { now: NOW });
    expect(result.records).toHaveLength(3);
    expect(new Set(result.records.map((row) => row.integrationId))).toEqual(new Set(["genesys-1", "m365-1", "m365-2"]));
    expect(result.sources.filter((source) => source.implemented)).toHaveLength(3);
  });

  it("warns for a connected provider without license_inventory", async () => {
    const tables = baseTables();
    tables.integrations = [...(tables.integrations ?? []), { id: "slack-1", tenant_id: tenant, provider: "slack", display_name: "Slack", status: "connected", health_status: "healthy", last_sync_at: new Date(NOW - 5 * 60_000).toISOString(), is_mock: false, active_snapshot_id: null, active_sync_run_id: null }];
    tables.agent_integration_bindings = [...(tables.agent_integration_bindings ?? []), { id: "bind-slack", tenant_id: tenant, agent_key: "agent-license", integration_id: "slack-1", capability_id: cap, enabled: true, is_mock: false, policy: {}, policy_version: 1, policy_updated_at: null, policy_updated_by: null }];
    const result = await capabilityRouter.getLicenseInventory(createFakeSupabase(tables) as any, user, "agent-license", { now: NOW });
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.warnings.some((warning) => warning.includes("Slack does not yet supply license_inventory"))).toBe(true);
  });

  it("resolves the m365 alias to the canonical microsoft365 implementation", async () => {
    const tables = baseTables();
    tables.integrations = tables.integrations?.filter((row) => row.provider === "m365");
    tables.agent_integration_bindings = tables.agent_integration_bindings?.filter((row) => row.integration_id === "m365-2");
    const result = await capabilityRouter.getLicenseInventory(createFakeSupabase(tables) as any, user, "agent-license", { now: NOW });
    expect(result.records[0]?.provider).toBe("microsoft365");
    expect(result.sources[0]?.provider).toBe("microsoft365");
  });
});
