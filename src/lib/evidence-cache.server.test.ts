import { beforeEach, describe, expect, it } from "vitest";

import { clearEvidenceCache, withEvidenceCache } from "./evidence-cache.server";

describe("withEvidenceCache", () => {
  beforeEach(() => clearEvidenceCache());

  it("reuses a tenant-scoped value for repeated reads", async () => {
    let loads = 0;
    const loader = async () => {
      loads += 1;
      return { value: loads };
    };

    const first = await withEvidenceCache("tenant-a", "workspace", "user-a", loader);
    const second = await withEvidenceCache("tenant-a", "workspace", "user-a", loader);

    expect(first).toEqual({ value: 1 });
    expect(second).toEqual(first);
    expect(loads).toBe(1);
  });

  it("shares the in-flight promise for concurrent reads", async () => {
    let loads = 0;
    const loader = async () => {
      loads += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return "evidence";
    };

    const results = await Promise.all(
      Array.from({ length: 10 }, () => withEvidenceCache("tenant-a", "report", "user-a", loader)),
    );

    expect(results).toEqual(Array.from({ length: 10 }, () => "evidence"));
    expect(loads).toBe(1);
  });

  it("keeps tenants and scopes isolated", async () => {
    let loads = 0;
    const loader = async () => ++loads;

    const tenantA = await withEvidenceCache("tenant-a", "report", "user-a", loader);
    const tenantB = await withEvidenceCache("tenant-b", "report", "user-a", loader);
    const userB = await withEvidenceCache("tenant-a", "report", "user-b", loader);

    expect(tenantA).toBe(1);
    expect(tenantB).toBe(2);
    expect(userB).toBe(3);
    expect(loads).toBe(3);
  });

  it("does not retain failed loads", async () => {
    let loads = 0;
    const loader = async () => {
      loads += 1;
      if (loads === 1) throw new Error("temporary failure");
      return "ok";
    };

    await expect(withEvidenceCache("tenant-a", "report", "user-a", loader)).rejects.toThrow("temporary failure");
    await expect(withEvidenceCache("tenant-a", "report", "user-a", loader)).resolves.toBe("ok");
    expect(loads).toBe(2);
  });
});
