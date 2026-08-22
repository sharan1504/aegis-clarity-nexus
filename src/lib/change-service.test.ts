import { beforeEach, describe, expect, it, vi } from "vitest";

const audit = vi.fn();
const notify = vi.fn();
const externalTicket = vi.fn();
const approvalUpdate = vi.fn();
const recordUpdate = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "change_approvals") {
        return { update: vi.fn(() => ({ in: approvalUpdate })) };
      }
      if (table === "change_records") {
        return { update: vi.fn(() => ({ eq: recordUpdate })) };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  },
}));

vi.mock("@/lib/audit", () => ({ writeAudit: audit }));
vi.mock("@/lib/realtime", () => ({ pushNotification: notify }));
vi.mock("@/lib/integrations/external-ticket.server", () => ({ createExternalTicketServer: externalTicket }));

import { bulkDecideChanges, decideChange } from "./change-service";
import type { ChangeRecord } from "./change-data";

const record = (overrides: Partial<ChangeRecord> = {}): ChangeRecord => ({
  rowId: "row-1",
  id: "CHG-1",
  title: "Test change",
  stage: "Team Approvals",
  severity: "high",
  risk: { tier: "High", score: 60, factors: [] },
  executionMode: "Manual",
  ownerTeam: "Platform",
  requester: "tester",
  category: "Operations",
  agent: "Test Agent",
  window: { start: "2026-08-22T10:00:00Z", end: "2026-08-22T11:00:00Z", inMaintenance: true },
  businessImpact: "Test",
  aiReasoning: "Test reasoning",
  approvals: [],
  rollbackSteps: [],
  validations: [],
  externalTickets: [],
  timeline: [],
  audit: [],
  createdAt: "2026-08-22T09:00:00Z",
  ...overrides,
});

const actor = { tenantId: "tenant-1", actor: "Admin", role: "admin" };

beforeEach(() => {
  vi.clearAllMocks();
  approvalUpdate.mockResolvedValue({ error: null });
  recordUpdate.mockResolvedValue({ error: null });
  audit.mockResolvedValue(undefined);
  notify.mockResolvedValue(undefined);
});

describe("change-service edge cases", () => {
  it("does not advance the stage when an approval is rejected", async () => {
    const change = record({
      approvals: [{ rowId: "approval-1", team: "Security", approver: "A", role: "Analyst", status: "pending" }],
    });

    await decideChange(change, "rejected", actor, "Not ready");

    expect(approvalUpdate).toHaveBeenCalledTimes(1);
    expect(recordUpdate).toHaveBeenCalledTimes(1);
    const updatePayload = recordUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updatePayload.stage).toBeUndefined();
    expect((updatePayload.timeline as Array<{ text: string }>)[0]?.text).toContain("rejected");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "change.rejected", tenantId: "tenant-1" }));
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("advances one stage for an approved decision and records the approval result", async () => {
    const change = record({
      approvals: [{ rowId: "approval-1", team: "Security", approver: "A", role: "Analyst", status: "pending" }],
    });

    await decideChange(change, "approved", actor);

    const updatePayload = recordUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updatePayload.stage).toBe("Ready to Execute");
    expect((updatePayload.timeline as Array<{ text: string }>)[0]?.text).toContain("Stage advanced to Ready to Execute");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "change.approved" }));
  });

  it("does not issue an approval-table update when approvals have no persisted row id", async () => {
    const change = record({
      approvals: [{ team: "Security", approver: "A", role: "Analyst", status: "pending" }],
    });

    await decideChange(change, "approved", actor);

    expect(approvalUpdate).not.toHaveBeenCalled();
    expect(recordUpdate).toHaveBeenCalledTimes(1);
  });

  it("records a bulk audit event even when the input set is empty", async () => {
    await bulkDecideChanges([], "approved", actor);

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "change.bulk_approved",
        tenantId: "tenant-1",
        payload: { changeIds: [] },
      }),
    );
  });
});
