import { describe, expect, it, beforeEach } from "vitest";

import { loadCommandCenterData } from "./command-center.server";
import { clearTenantContextCache } from "@/lib/tenant-context.server";

function makeDemoClient() {
  const queriedTables: string[] = [];
  const client = {
    from(table: string) {
      queriedTables.push(table);
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        or() { return chain; },
        gte() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        async maybeSingle() {
          if (table === "profiles") return { data: { tenant_id: "tenant-demo" }, error: null };
          throw new Error(`Unexpected maybeSingle query: ${table}`);
        },
        async single() {
          if (table === "tenants") return { data: { environment_mode: "demo" }, error: null };
          throw new Error(`Unexpected single query: ${table}`);
        },
        then(resolve: (value: unknown) => unknown) {
          if (table === "user_roles") return Promise.resolve(resolve({ data: [{ role: "admin" }], error: null }));
          throw new Error(`Unexpected list query: ${table}`);
        },
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
        select() { return chain; },
        eq() { return chain; },
        order() { return chain; },
        async maybeSingle() {
          if (table === "profiles") return { data: { tenant_id: "tenant-live" }, error: null };
          throw new Error(`Unexpected maybeSingle query: ${table}`);
        },
        async single() {
          if (table === "tenants") return { data: { environment_mode: "live" }, error: null };
          throw new Error(`Unexpected single query: ${table}`);
        },
        then(resolve: (value: unknown) => unknown) {
          if (table === "user_roles") return Promise.resolve(resolve({ data: [{ role: "admin" }], error: null }));
          if (table === "integrations") return Promise.resolve(resolve({ data: [], error: null }));
          throw new Error(`Unexpected list query after empty integration state: ${table}`);
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
    expect(data.changed).toEqual([]);
    expect(data.signals).toEqual([]);
    expect(data.attention.pendingChanges).toBe(0);
    expect(data.posture.integrations).toEqual([]);
    expect(queriedTables).toEqual(["profiles", "user_roles", "tenants", "integrations"]);
  });
});
