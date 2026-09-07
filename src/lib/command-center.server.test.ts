import { describe, expect, it } from "vitest";

import { loadCommandCenterData } from "./command-center.server";

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
