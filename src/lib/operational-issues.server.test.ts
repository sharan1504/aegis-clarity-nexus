import { describe, expect, it, vi } from "vitest";
import { recordOperationalIssue } from "./operational-issues.server";

describe("recordOperationalIssue", () => {
  it("calls the atomic recorder with tenant, related id and fingerprint", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "issue-1", error: null });
    const single = vi.fn().mockResolvedValue({ data: { id: "issue-1", tenant_id: "tenant-1", source: "sync", severity: "high", title: "Sync failed", detail: "timeout", status: "open", related_id: "run-1", dedupe_key: "sync:run-1", first_seen_at: "2026-09-09T00:00:00Z", last_seen_at: "2026-09-09T00:01:00Z", occurrence_count: 2, resolved_at: null, resolved_by: null }, error: null });
    const client: any = { rpc, from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single }) };
    const result = await recordOperationalIssue(client, { tenantId: "tenant-1", source: "sync", severity: "high", title: "Sync failed", detail: "timeout", relatedId: "run-1", fingerprint: "stable-sync" });
    expect(rpc).toHaveBeenCalledWith("record_operational_issue", { p_tenant_id: "tenant-1", p_source: "sync", p_severity: "high", p_title: "Sync failed", p_detail: "timeout", p_related_id: "run-1", p_fingerprint: "stable-sync" });
    expect(result?.occurrenceCount).toBe(2);
  });

  it("returns null when the recorder fails closed", async () => {
    const client: any = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "database unavailable" } }) };
    await expect(recordOperationalIssue(client, { tenantId: "tenant-1", source: "command_center", severity: "critical", title: "Query failed", detail: "database unavailable" })).resolves.toBeNull();
  });
});
