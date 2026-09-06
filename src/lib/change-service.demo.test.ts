import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  updateRecords: vi.fn(),
}));

vi.mock("@/lib/demo-data", () => ({ DEMO_DATA_ENABLED: true }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/realtime", () => ({
  pushNotification: mocks.notify,
  updateRecords: mocks.updateRecords,
}));
vi.mock("@/lib/integrations/external-ticket.server", () => ({ createExternalTicketServer: vi.fn() }));

import { decideChange, initiateRollback } from "./change-service";
import type { ChangeRecord } from "./change-data";

const record = (overrides: Partial<ChangeRecord> = {}): ChangeRecord => ({
  rowId: undefined,
  id: "AIG-DEMO-1042",
  title: "Reclaim inactive Genesys Cloud licenses",
  stage: "Team Approvals",
  severity: "high",
  risk: { tier: "High", score: 60, factors: [] },
  executionMode: "Manual",
  ownerTeam: "Contact Center / Licensing Operations",
  requester: "Aegis License Optimization Agent",
  category: "License",
  agent: "Aegis License Optimization Agent",
  window: { start: "2026-09-05T10:00:00Z", end: "2026-09-05T11:00:00Z", inMaintenance: true },
  businessImpact: "Review inactive licenses",
  aiReasoning: "Demo evidence identifies inactive licensed users.",
  approvals: [{ team: "Security", approver: "Admin", role: "admin", status: "pending" }],
  rollbackSteps: ["Restore the previous license assignment"],
  validations: [],
  externalTickets: [],
  timeline: [],
  audit: [],
  createdAt: "2026-09-04T06:50:00Z",
  ...overrides,
});

const actor = { tenantId: "tenant-1", actor: "Admin", role: "admin" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("change-service demo path", () => {
  it("updates the in-memory realtime record and notifies on approval", async () => {
    await decideChange(record(), "approved", actor);

    expect(mocks.updateRecords).toHaveBeenCalledTimes(1);
    const updater = mocks.updateRecords.mock.calls[0]?.[0] as (records: ChangeRecord[]) => ChangeRecord[];
    const updated = updater([record()])[0];

    expect(updated.stage).toBe("Ready to Execute");
    expect(updated.approvals[0]?.status).toBe("approved");
    expect(updated.timeline[0]?.text).toContain("Stage advanced to Ready to Execute");
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });

  it("does not advance the stage when a demo approval is rejected", async () => {
    await decideChange(record(), "rejected", actor, "Not ready");

    const updater = mocks.updateRecords.mock.calls[0]?.[0] as (records: ChangeRecord[]) => ChangeRecord[];
    const updated = updater([record()])[0];

    expect(updated.stage).toBe("Team Approvals");
    expect(updated.approvals[0]?.status).toBe("rejected");
    expect(updated.timeline[0]?.text).toContain("rejected");
  });

  it("records a demo rollback in the realtime timeline", async () => {
    await initiateRollback(record(), actor);

    const updater = mocks.updateRecords.mock.calls[0]?.[0] as (records: ChangeRecord[]) => ChangeRecord[];
    const updated = updater([record()])[0];

    expect(updated.timeline[0]?.text).toContain("Rollback initiated by Admin");
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });
});
