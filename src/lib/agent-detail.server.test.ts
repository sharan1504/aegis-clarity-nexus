import { describe, expect, it, vi } from "vitest";
import { loadAgentDetail } from "./agent-detail.server";

vi.mock("@/lib/tenant-context.server", () => ({
  resolveTenantContext: vi.fn().mockResolvedValue({ tenantId: "demo-tenant", roles: ["admin"], canManage: true, environmentMode: "demo" }),
}));

const seededAgentKeys = [
  "agent-license",
  "agent-cost",
  "agent-security",
  "agent-incident",
  "agent-ccx",
  "agent-workflow",
  "agent-knowledge",
] as const;

describe("loadAgentDetail demo fixtures", () => {
  it("loads every seeded demo agent without throwing", async () => {
    for (const agentKey of seededAgentKeys) {
      await expect(loadAgentDetail({} as never, "demo-user", agentKey)).resolves.toMatchObject({
        agentKey,
        generatedAt: expect.any(String),
      });
    }
  });
});
