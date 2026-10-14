import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearEvidenceCache, withEvidenceCache } from "./evidence-cache.server";

function sharedClient(initialGeneration = 1) {
  const versions = new Map<string, number>();
  const entries = new Map<string, any>();
  const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
    const tenantId = String(args.p_tenant_id);
    const generation = (versions.get(tenantId) ?? initialGeneration) + 1;
    versions.set(tenantId, generation);
    return { data: generation, error: null };
  });
  const from = vi.fn((table: string) => ({
    select: (_columns: string) => {
      let tenantId = "";
      let dataType = "";
      let scope = "";
      let generation: number | undefined;
      let expiresAfter: string | undefined;
      const query: any = {
        eq(column: string, value: unknown) {
          if (column === "tenant_id") tenantId = String(value);
          if (column === "data_type") dataType = String(value);
          if (column === "scope_key") scope = String(value);
          if (column === "generation") generation = Number(value);
          return query;
        },
        gt(_column: string, value: string) { expiresAfter = value; return query; },
        maybeSingle: async () => {
          if (table === "evidence_cache_versions") {
            const value = versions.get(tenantId);
            return { data: value === undefined ? null : { generation: value }, error: null };
          }
          const value = entries.get(`${tenantId}:${dataType}:${scope}`);
          return { data: value && value.generation === generation && value.expires_at > String(expiresAfter) ? value : null, error: null };
        },
      };
      return query;
    },
    upsert: async (row: any) => { entries.set(`${row.tenant_id}:${row.data_type}:${row.scope_key}`, row); return { error: null }; },
  }));
  return { client: { from, rpc } as any, versions, entries, rpc };
}

describe("withEvidenceCache", () => {
  beforeEach(() => clearEvidenceCache());

  it("reuses a tenant-scoped value for repeated reads", async () => {
    let loads = 0;
    const loader = async () => ({ value: ++loads });
    const first = await withEvidenceCache("tenant-a", "workspace", "user-a", loader);
    const second = await withEvidenceCache("tenant-a", "workspace", "user-a", loader);
    expect(second).toEqual(first);
    expect(loads).toBe(1);
  });

  it("shares the in-flight promise for concurrent reads", async () => {
    let loads = 0;
    const loader = async () => { loads += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return "evidence"; };
    const results = await Promise.all(Array.from({ length: 10 }, () => withEvidenceCache("tenant-a", "report", "user-a", loader)));
    expect(results).toEqual(Array.from({ length: 10 }, () => "evidence"));
    expect(loads).toBe(1);
  });

  it("keeps tenants and scopes isolated", async () => {
    let loads = 0;
    const loader = async () => ++loads;
    expect(await withEvidenceCache("tenant-a", "report", "user-a", loader)).toBe(1);
    expect(await withEvidenceCache("tenant-b", "report", "user-a", loader)).toBe(2);
    expect(await withEvidenceCache("tenant-a", "report", "user-b", loader)).toBe(3);
  });

  it("does not retain failed loads", async () => {
    let loads = 0;
    const loader = async () => { if (++loads === 1) throw new Error("temporary failure"); return "ok"; };
    await expect(withEvidenceCache("tenant-a", "report", "user-a", loader)).rejects.toThrow("temporary failure");
    await expect(withEvidenceCache("tenant-a", "report", "user-a", loader)).resolves.toBe("ok");
  });

  it("shares a value across independent cache instances through the database", async () => {
    const shared = sharedClient();
    let loads = 0;
    const loader = async () => ({ value: ++loads });
    const first = await withEvidenceCache("tenant-a", "report", "user-a", loader, shared.client);
    await clearEvidenceCache();
    const second = await withEvidenceCache("tenant-a", "report", "user-a", loader, shared.client);
    expect(first).toEqual({ value: 1 });
    expect(second).toEqual(first);
    expect(loads).toBe(1);
  });

  it("observes tenant generation changes after cross-instance invalidation", async () => {
    const shared = sharedClient();
    let loads = 0;
    const loader = async () => ({ value: ++loads });
    await withEvidenceCache("tenant-a", "report", "user-a", loader, shared.client);
    await clearEvidenceCache(shared.client, "tenant-a");
    const refreshed = await withEvidenceCache("tenant-a", "report", "user-a", loader, shared.client);
    expect(refreshed).toEqual({ value: 2 });
    expect(loads).toBe(2);
    expect(shared.rpc).toHaveBeenCalledWith("invalidate_evidence_cache", { p_tenant_id: "tenant-a" });
  });
});
