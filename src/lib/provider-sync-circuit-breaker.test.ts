import { describe, expect, it } from "vitest";
import { getSyncFailureState } from "./provider-sync-circuit-breaker";

describe("provider sync circuit breaker", () => {
  it("degrades after three consecutive failures", () => {
    expect(getSyncFailureState([{ status: "failed" }, { status: "failed" }, { status: "failed" }])).toEqual({ failureStreak: 3, degraded: true });
  });
  it("does not count failures across a successful sync", () => {
    expect(getSyncFailureState([{ status: "failed" }, { status: "success" }, { status: "failed" }])).toEqual({ failureStreak: 1, degraded: false });
  });
});
