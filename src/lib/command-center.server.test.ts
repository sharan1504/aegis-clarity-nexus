import { describe, expect, it, beforeEach } from "vitest";

import { loadCommandCenterData } from "./command-center.server";
import { clearTenantContextCache } from "@/lib/tenant-context.server";

function makeDemoClient() {
  const queriedTables: string[] = [];
  const client = {
    from(table: string) {
      queriedTables.push(table);
      const chain = {
        select() { return chain; }, eq() { return chain; }, or() { return chain; }, gte() { return chain; }, order() { return chain; }, limit() { return chain; },
        async maybeSingle() { if (table === "profiles") return { data: { tenant_id: "tenant-demo" }, error: null }; throw new Error(`Unexpected maybeSingle query: ${table}`); },
        async single() { if (table === "tenants") return { data: { environment_mode: "demo" }, error: null }; throw new Error(`Unexpected single query: ${table}`); },
        then(resolve: (value: unknown) => unknown) { if (table === "user_roles") return Promise.resolve(resolve({ data: [{ role: "admin" }], error: null })); throw new Error(`Unexpected list query: ${table}`); },
      };
      return chain;
    },
  };
  return { client, queriedTables };
}

function makeEmptyLiveClient() {
  const queriedTables: string[] = [];
  const client = {
    from(table: string) {
      queriedTables.push(table);
      const chain = {
        select() { return chain; }, eq() { return chain; }, order() { return chain; },
        async maybeSingle() { if (table === "profiles") return { data: { tenant_id: "tenant-live" }, error: null }; throw new Error(`Unexpected maybeSingle query: ${table}`); },
        async single() { if (table === "tenants") return { data: { environment_mode: "live" }, error: null }; throw new Error(`Unexpected single query: ${table}`); },
        then(resolve: (value: unknown) => unknown) { if (table === "user_roles") return Promise.resolve(resolve({ data: [{ role: "admin" }], error: null })); if (table === "integrations") return Promise.resolve(resolve({ data: [], error: null })); throw new Error(`Unexpected list query after empty integration state: ${table}`); },
      };
      return chain;
    },
  };
  return { client, queriedTables };
}

function makeLiveFixtureClient() {
  const queriedTables: string[] = [];
  const now = new Date();
  const day = (offset: number) => new Date(now.getTime() - offset * 86_400_000).toISOString();
  const rows: Record<string, unknown> = {
    integrations: [{ id: "int-1", provider: "aws", status: "connected", health_status: "healthy", last_sync_at: day(0), last_sync_status: "success", is_mock: false, external_org_name: "Acme AWS", region: "us-east-1", updated_at: day(0) }],
    change_records: [{ id: "change-1", change_id: "CHG-1", title: "High risk change", stage: "Proposed", severity: "high", owner_team: "Platform", created_at: day(1), updated_at: day(0) }],
    guardrails: [{ id: "g-1", enabled: true, enforcement_mode: "enforce" }],
    guardrail_evaluations: [{ id: "ge-1", decision: "block", created_at: day(0) }],
    agent_integration_bindings: [{ agent_key: "agent-1", enabled: true, is_mock: false }],
    integration_sync_runs: [{ started_at: day(0), finished_at: day(0), status: "failed" }, { started_at: day(2), finished_at: day(2), status: "success" }],
    notifications: [{ id: "n-1", unread: true }],
    audit_log: [{ id: "a-1", action: "integration.sync.failed", entity_type: "integration", entity_id: "int-1", detail: "sync failed", actor_email: "system", created_at: day(0) }],
  };
  const client = {
    from(table: string) {
      queriedTables.push(table);
      const chain = {
        select() { return chain; }, eq() { return chain; }, or() { return chain; }, gte() { return chain; }, order() { return chain; }, limit() { return chain; },
        async maybeSingle() { if (table === "profiles") return { data: { tenant_id: "tenant-live-fixture" }, error: null }; throw new Error(`Unexpected maybeSingle query: ${table}`); },
        async single() { if (table === "tenants") return { data: { environment_mode: "live" }, error: null }; throw new Error(`Unexpected single query: ${table}`); },
        then(resolve: (value: unknown) => unknown) {
          if (table === "user_roles") return Promise.resolve(resolve({ data: [{ role: "admin" }], error: null }));
          return Promise.resolve(resolve({ data: rows[table] ?? [], error: null }));
        },
      };
      return chain;
    },
  };
  return { client, queriedTables };
}

beforeEach(() => clearTenantContextCache());

describe("loadCommandCenterData demo isolation", () => {
  it("does not query live provider tables when the tenant is in demo mode", async () => {
    const { client, queriedTables } = makeDemoClient();
    const data = await loadCommandCenterData(client as never, "user-demo");
    expect(data.live.connected).toBe(true);
    expect(data.live.provider).toBeTruthy();
    expect(data.kpis.integrationsTotal).toBeGreaterThan(0);
    expect(data.trends.days).toHaveLength(7);
    expect(data.genesys?.licensedUsers).toBe(DEMO_EXPECTED_LICENSED_USERS);
    expect(data.changed.length).toBeGreaterThan(0);
    expect(data.signals.length).toBeGreaterThan(0);
    expect(queriedTables).toEqual(["profiles", "user_roles", "tenants"]);
  });
});

describe("loadCommandCenterData empty live state", () => {
  it("returns a blank evidence state without querying dependent provider tables", async () => {
    const { client, queriedTables } = makeEmptyLiveClient();
    const data = await loadCommandCenterData(client as never, "user-live-empty");
    expect(data.live.connected).toBe(false);
    expect(data.live.provider).toBeNull();
    expect(data.kpis).toEqual({ integrationsTotal: 0, integrationsConnected: 0, integrationsDegraded: 0, pendingApprovals: 0, proposedChanges: 0, openHighChanges: 0, guardrailBlocks24h: 0, syncFailures24h: 0, unreadNotifications: 0, agentsConfigured: 0, agentsWithRealBindings: 0 });
    expect(data.trends.days).toEqual([]);
    expect(data.genesys).toBeNull();
    expect(data.changed).toEqual([]);
    expect(data.signals).toEqual([]);
    expect(data.attention.pendingChanges).toBe(0);
    expect(data.posture.integrations).toEqual([]);
    expect(queriedTables).toEqual(["profiles", "user_roles", "tenants", "integrations"]);
  });
});

describe("loadCommandCenterData live aggregation", () => {
  it("computes multi-provider KPIs and seven-day evidence from tenant tables", async () => {
    const { client } = makeLiveFixtureClient();
    const data = await loadCommandCenterData(client as never, "user-live-fixture");
    expect(data.kpis.integrationsTotal).toBe(1);
    expect(data.kpis.integrationsConnected).toBe(1);
    expect(data.kpis.openHighChanges).toBe(1);
    expect(data.kpis.guardrailBlocks24h).toBe(1);
    expect(data.kpis.syncFailures24h).toBe(1);
    expect(data.kpis.unreadNotifications).toBe(1);
    expect(data.kpis.agentsWithRealBindings).toBe(1);
    expect(data.trends.days).toHaveLength(7);
    expect(data.trends.syncFailed.reduce((sum, value) => sum + value, 0)).toBe(1);
    expect(data.trends.guardrailBlocks.reduce((sum, value) => sum + value, 0)).toBe(1);
    expect(data.trends.auditEvents.reduce((sum, value) => sum + value, 0)).toBe(1);
    expect(data.genesys).toBeNull();
    expect(data.posture.integrations).toHaveLength(1);
  });
});

const DEMO_EXPECTED_LICENSED_USERS = 0;
