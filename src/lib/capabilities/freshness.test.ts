import { describe, expect, it } from "vitest";

import { evaluateFreshness, worstFreshness } from "./freshness";

const NOW = new Date("2026-08-17T12:00:00.000Z").getTime();
const MIN = 60_000;

describe("freshness", () => {
  it("reports fresh for a recent sync", () => {
    const info = evaluateFreshness(new Date(NOW - 12 * MIN).toISOString(), NOW);
    expect(info.state).toBe("fresh");
    expect(info.ageLabel).toBe("12 minutes ago");
  });

  it("reports aging between 1 and 8 hours", () => {
    expect(evaluateFreshness(new Date(NOW - 3 * 60 * MIN).toISOString(), NOW).state).toBe("aging");
  });

  it("reports stale after 8 hours", () => {
    const info = evaluateFreshness(new Date(NOW - 9 * 60 * MIN).toISOString(), NOW);
    expect(info.state).toBe("stale");
    expect(info.ageLabel).toBe("9 hours ago");
  });

  it("reports unavailable when never synchronized", () => {
    expect(evaluateFreshness(null, NOW).state).toBe("unavailable");
    expect(evaluateFreshness("not-a-date", NOW).state).toBe("unavailable");
  });

  it("takes the worst state across sources", () => {
    expect(worstFreshness(["fresh", "stale", "aging"])).toBe("stale");
    expect(worstFreshness([])).toBe("unavailable");
  });
});
