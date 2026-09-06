import { describe, expect, it } from "vitest";
import { DEMO_DATA_ENABLED } from "@/lib/demo-data";
import { loadAgentDetail } from "./agent-detail.server";

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
    if (!DEMO_DATA_ENABLED) return;

    for (const agentKey of seededAgentKeys) {
      await expect(loadAgentDetail({} as never, "demo-user", agentKey)).resolves.toMatchObject({
        agentKey,
        generatedAt: expect.any(String),
      });
    }
  });
});
