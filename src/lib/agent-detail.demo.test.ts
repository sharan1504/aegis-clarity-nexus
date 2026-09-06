import { describe, expect, it } from "vitest";
import { loadAgentDetail, type UserClientLike } from "@/lib/agent-detail.server";
import { DEMO_DATA_ENABLED } from "@/lib/demo-data";

// Demo mode must short-circuit before any Supabase access, so this stub throws
// if the server function ever tries to read the database in demo mode.
const throwingClient = {
  from() {
    throw new Error("Supabase must not be reached while demo data is enabled.");
  },
} as unknown as UserClientLike;

const AGENT_KEYS = [
  "agent-license",
  "agent-cost",
  "agent-security",
  "agent-incident",
  "agent-ccx",
  "agent-workflow",
  "agent-knowledge",
];

describe("loadAgentDetail demo coverage", () => {
  it("has demo data enabled for this suite", () => {
    expect(DEMO_DATA_ENABLED).toBe(true);
  });

  it.each(AGENT_KEYS)("returns demo detail for %s without throwing", async (agentKey) => {
    const detail = await loadAgentDetail(throwingClient, "demo-user", agentKey);
    expect(detail).not.toBeNull();
    expect(detail?.agentKey).toBe(agentKey);
    expect(detail?.displayName.length).toBeGreaterThan(0);
    expect(detail?.workflow?.steps.length ?? 0).toBeGreaterThan(0);
    expect(detail?.generatedAt).toBeTruthy();
    expect(Array.isArray(detail?.bindings)).toBe(true);
  });
});
