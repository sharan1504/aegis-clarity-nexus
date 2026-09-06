import { describe, expect, it, beforeEach } from "vitest";

import {
  clearTenantContextCache,
  resolveTenantContext,
} from "./tenant-context.server";

function makeClient(input: { tenantId: string; roles: string[] }) {
  const calls = { profiles: 0, userRoles: 0 };

  const client = {
    from(table: string) {
      const state: { userId?: string; tenantId?: string } = {};
      const chain = {
        select() {
          return chain;
        },
        eq(column: string, value: string) {
          if (table === "profiles" && column === "id") state.userId = value;
          if (table === "user_roles" && column === "tenant_id") state.tenantId = value;
          return chain;
        },
        async maybeSingle() {
          if (table === "profiles") {
            calls.profiles += 1;
            return { data: { tenant_id: input.tenantId } };
          }
          throw new Error("unexpected maybeSingle call");
        },
        async then(resolve: (value: unknown) => unknown) {
          calls.userRoles += 1;
          return resolve({
            data: input.roles.map((role) => ({ role })),
          });
        },
      };
      return chain;
    },
  };

  return { client, calls };
}

describe("resolveTenantContext", () => {
  beforeEach(() => clearTenantContextCache());

  it("resolves once for repeated calls within the cache window", async () => {
    const { client, calls } = makeClient({ tenantId: "tenant-a", roles: ["admin"] });

    const first = await resolveTenantContext(client as never, "user-a");
    const second = await resolveTenantContext(client as never, "user-a");
    const third = await resolveTenantContext(client as never, "user-a");

    expect(first).toEqual({ tenantId: "tenant-a", roles: ["admin"], canManage: true, environmentMode: "live" });
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(calls.profiles).toBe(1);
    expect(calls.userRoles).toBe(1);
  });

  it("shares the in-flight resolution across concurrent calls", async () => {
    const { client, calls } = makeClient({ tenantId: "tenant-b", roles: ["manager"] });

    const results = await Promise.all(
      Array.from({ length: 10 }, () => resolveTenantContext(client as never, "user-b")),
    );

    expect(results).toHaveLength(10);
    expect(results.every((result) => result.tenantId === "tenant-b")).toBe(true);
    expect(calls.profiles).toBe(1);
    expect(calls.userRoles).toBe(1);
  });

  it("keeps cached contexts isolated by user", async () => {
    const userA = makeClient({ tenantId: "tenant-a", roles: ["admin"] });
    const userB = makeClient({ tenantId: "tenant-b", roles: ["viewer"] });

    const a = await resolveTenantContext(userA.client as never, "user-a");
    const b = await resolveTenantContext(userB.client as never, "user-b");

    expect(a.tenantId).toBe("tenant-a");
    expect(b.tenantId).toBe("tenant-b");
    expect(userA.calls.profiles).toBe(1);
    expect(userB.calls.profiles).toBe(1);
  });
});
