import { describe, expect, it, vi } from "vitest";
import { loadAgentDetail, type UserClientLike } from "@/lib/agent-detail.server";

vi.mock("@/lib/tenant-context.server", () => ({
  resolveTenantContext: vi.fn(async () => ({ tenantId: "demo-tenant", roles: ["admin"], environmentMode: "demo" as const })),
}));

const throwingClient = {
  from() {
    throw new Error("Supabase must not be reached while demo data is enabled.");
  },
} as unknown as UserClientLike;

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
      await expect(loadAgentDetail(throwingClient, "demo-user", agentKey)).resolves.toMatchObject({
        agentKey,
        generatedAt: expect.any(String),
      });
    }
  });
});
