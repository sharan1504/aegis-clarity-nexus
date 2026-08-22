import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  notify: vi.fn(),
  externalTicket: vi.fn(),
  approvalUpdate: vi.fn(),
  recordUpdate: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "change_approvals") {
        return { update: vi.fn(() => ({ in: mocks.approvalUpdate })) };
      }
      if (table === "change_records") {
        return { update: vi.fn(() => ({ eq: mocks.recordUpdate })) };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  },
}));

vi.mock("@/lib/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/realtime", () => ({ pushNotification: mocks.notify }));
vi.mock("@/lib/integrations/external-ticket.server", () => ({ createExternalTicketServer: mocks.externalTicket }));

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
  mocks.approvalUpdate.mockResolvedValue({ error: null });
  mocks.recordUpdate.mockResolvedValue({ error: null });
  mocks.audit.mockResolvedValue(undefined);
  mocks.notify.mockResolvedValue(undefined);
});

describe("change-service edge cases", () => {
  it("does not advance the stage when an approval is rejected", async () => {
    const change = record({
      approvals: [{ rowId: "approval-1", team: "Security", approver: "A", role: "Analyst", status: "pending" }],
    });

    await decideChange(change, "rejected", actor, "Not ready");

    expect(mocks.approvalUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.recordUpdate).toHaveBeenCalledTimes(1);
    const updatePayload = mocks.recordUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updatePayload.stage).toBeUndefined();
    expect((updatePayload.timeline as Array<{ text: string }>)[0]?.text).toContain("rejected");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "change.rejected", tenantId: "tenant-1" }));
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });

  it("advances one stage for an approved decision and records the approval result", async () => {
    const change = record({
      approvals: [{ rowId: "approval-1", team: "Security", approver: "A", role: "Analyst", status: "pending" }],
    });

    await decideChange(change, "approved", actor);

    const updatePayload = mocks.recordUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updatePayload.stage).toBe("Ready to Execute");
    expect((updatePayload.timeline as Array<{ text: string }>)[0]?.text).toContain("Stage advanced to Ready to Execute");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "change.approved" }));
  });

  it("does not issue an approval-table update when approvals have no persisted row id", async () => {
    const change = record({
      approvals: [{ team: "Security", approver: "A", role: "Analyst", status: "pending" }],
    });

    await decideChange(change, "approved", actor);

    expect(mocks.approvalUpdate).not.toHaveBeenCalled();
    expect(mocks.recordUpdate).toHaveBeenCalledTimes(1);
  });

  it("records a bulk audit event even when the input set is empty", async () => {
    await bulkDecideChanges([], "approved", actor);

    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "change.bulk_approved",
        tenantId: "tenant-1",
        payload: { changeIds: [] },
      }),
    );
  });
});
