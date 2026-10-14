import { afterEach, describe, expect, it, vi } from "vitest";

import { deliverPendingAuditAnchors } from "./audit-anchor.server";

function anchorDb(rows: any[]) {
  const updates: any[] = [];
  // Supabase builders are thenables; update chains resolve after the final eq().
  const from = vi.fn(() => ({
    select: () => query,
    in: () => query,
    order: () => query,
    limit: async () => ({ data: rows, error: null }),
    update: (value: any) => {
      const updateQuery: any = {
        eq: () => updateQuery,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
      };
      updates.push(value);
      return updateQuery;
    },
  }));
  return { db: { from }, updates };
}

describe("deliverPendingAuditAnchors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AUDIT_ANCHOR_URL;
    delete process.env.AUDIT_ANCHOR_HMAC_SECRET;
  });

  it("requires a configured HTTPS anchor endpoint and strong signing secret", async () => {
    const { db } = anchorDb([]);
    await expect(deliverPendingAuditAnchors(db)).rejects.toThrow("AUDIT_ANCHOR_HMAC_SECRET");
    process.env.AUDIT_ANCHOR_HMAC_SECRET = "x".repeat(40);
    process.env.AUDIT_ANCHOR_URL = "http://anchor.example.test";
    await expect(deliverPendingAuditAnchors(db)).rejects.toThrow("must be an HTTPS URL");
  });

  it("accepts only a receipt that confirms the exact chain head", async () => {
    process.env.AUDIT_ANCHOR_URL = "https://anchor.example.test/v1/anchors";
    process.env.AUDIT_ANCHOR_HMAC_SECRET = "s".repeat(40);
    const { db, updates } = anchorDb([{ id: "anchor-row", tenant_id: "tenant-a", chain_sequence: 100, head_hash: "head-100", attempts: 0 }]);
    const fetchMock = vi.fn(async (_input: unknown, init: any) => {
      expect(init.headers["x-cenops-signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);
      return new Response(JSON.stringify({ anchorId: "external-123", headHash: "head-100" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await deliverPendingAuditAnchors(db);
    expect(result).toMatchObject({ processed: 1, anchored: 1, failed: 0 });
    expect(updates[0]).toMatchObject({ status: "anchored", external_reference: "external-123", attempts: 1 });
  });

  it("does not mark a mismatched external receipt as anchored", async () => {
    process.env.AUDIT_ANCHOR_URL = "https://anchor.example.test/v1/anchors";
    process.env.AUDIT_ANCHOR_HMAC_SECRET = "s".repeat(40);
    const { db, updates } = anchorDb([{ id: "anchor-row", tenant_id: "tenant-a", chain_sequence: 100, head_hash: "expected-head", attempts: 1 }]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ anchorId: "external-123", headHash: "other-head" }), { status: 200 })));
    const result = await deliverPendingAuditAnchors(db);
    expect(result).toMatchObject({ processed: 1, anchored: 0, failed: 1 });
    expect(updates[0]).toMatchObject({ status: "failed", attempts: 2 });
  });
});
