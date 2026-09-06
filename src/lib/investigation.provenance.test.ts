import { describe, expect, it } from "vitest";
import { listInvestigations, loadInvestigation, type UserClientLike } from "@/lib/investigation.server";
import { DEMO_DATA_ENABLED, DEMO_VULNERABILITIES } from "@/lib/demo-data";

const throwingClient = {
  from() {
    throw new Error("Supabase must not be reached while demo data is enabled.");
  },
} as unknown as UserClientLike;

describe("investigation demo provenance", () => {
  it("exposes demo provenance on the vulnerability list", async () => {
    expect(DEMO_DATA_ENABLED).toBe(true);
    const result = await listInvestigations(throwingClient, "demo-user");
    expect(result.isDemo).toBe(true);
    expect(result.connected).toBe(true);
    expect(result.investigations).toHaveLength(DEMO_VULNERABILITIES.length);
    expect(result.investigations.every((item) => item.isDemo === true)).toBe(true);
  });

  it.each(DEMO_VULNERABILITIES.map((item) => item.id))("exposes demo provenance on %s", async (key) => {
    const result = await loadInvestigation(throwingClient, "demo-user", key);
    expect("unavailable" in result).toBe(false);
    if (!("unavailable" in result)) expect(result.isDemo).toBe(true);
  });
});
