import { describe, expect, it, vi } from "vitest";
import { recordOperationalIssue } from "./operational-issues.server";

describe("recordOperationalIssue", () => {
  it("coalesces repeated related failures", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "issue-1", tenant_id: "tenant-1", source: "sync", severity: "high", title: "Sync failed", detail: "timeout", status: "open", related_id: "run-1", dedupe_key: "sync:run-1", first_seen_at: "2026-09-09T00:00:00Z", last_seen_at: "2026-09-09T00:01:00Z", occurrence_count: 2, resolved_at: null, resolved_by: null }, error: null });
    const chain: any = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: "issue-1", occurrence_count: 1, first_seen_at: "2026-09-09T00:00:00Z", status: "open", resolved_at: null, resolved_by: null }, error: null }), upsert: vi.fn().mockReturnThis(), single };
    const client: any = { from: vi.fn().mockReturnValue(chain) };
    const result = await recordOperationalIssue(client, { tenantId: "tenant-1", source: "sync", severity: "high", title: "Sync failed", detail: "timeout", relatedId: "run-1" });
    expect(result?.occurrenceCount).toBe(2);
    expect(chain.upsert).toHaveBeenCalledWith(expect.objectContaining({ occurrence_count: 2, last_seen_at: expect.any(String) }), { onConflict: "tenant_id,dedupe_key" });
  });

  it("creates a stable fingerprint when there is no related record", async () => {
    const chain: any = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), upsert: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: "issue-1", tenant_id: "tenant-1", source: "command_center", severity: "critical", title: "Query failed", detail: "database unavailable", status: "open", related_id: null, dedupe_key: "command_center:aaaaaaaa", first_seen_at: "2026-09-09T00:00:00Z", last_seen_at: "2026-09-09T00:00:00Z", occurrence_count: 1, resolved_at: null, resolved_by: null }, error: null }) };
    const client: any = { from: vi.fn().mockReturnValue(chain) };
    await recordOperationalIssue(client, { tenantId: "tenant-1", source: "command_center", severity: "critical", title: "Query failed", detail: "database unavailable" });
    const first = chain.upsert.mock.calls[0][0].dedupe_key;
    expect(first).toMatch(/^command_center:[a-f0-9]{64}$/);
    await recordOperationalIssue(client, { tenantId: "tenant-1", source: "command_center", severity: "critical", title: "Query failed", detail: "database unavailable" });
    expect(chain.upsert.mock.calls[1][0].dedupe_key).toBe(first);
  });
});
