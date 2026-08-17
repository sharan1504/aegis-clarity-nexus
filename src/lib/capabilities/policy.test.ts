import { describe, expect, it } from "vitest";

import {
  coerceStoredPolicy,
  DEFAULT_AGENT_POLICY,
  parseAgentPolicy,
} from "./policy";

describe("policy schema validation (browser cannot bypass)", () => {
  it("accepts a valid policy", () => {
    const result = parseAgentPolicy({
      inactivity_threshold_days: 60,
      minimum_confidence: 95,
      maximum_affected_records: 250,
      risk_threshold: "high",
      approval_required: true,
      exclusions: { exclude_active_queue_members: true },
      configuration: { genesys_division_filter: "Support" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.policy.inactivity_threshold_days).toBe(60);
      expect(result.policy.configuration["genesys_division_filter"]).toBe("Support");
    }
  });

  it("rejects a non-positive inactivity threshold", () => {
    const result = parseAgentPolicy({ inactivity_threshold_days: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.field).toBe("inactivity_threshold_days");
  });

  it("rejects a non-integer inactivity threshold", () => {
    expect(parseAgentPolicy({ inactivity_threshold_days: 12.5 }).ok).toBe(false);
  });

  it("rejects confidence outside 0-100", () => {
    expect(parseAgentPolicy({ minimum_confidence: 140 }).ok).toBe(false);
    expect(parseAgentPolicy({ minimum_confidence: -1 }).ok).toBe(false);
  });

  it("rejects a non-positive maximum_affected_records", () => {
    expect(parseAgentPolicy({ maximum_affected_records: -5 }).ok).toBe(false);
  });

  it("rejects unknown top-level fields and unknown exclusions", () => {
    expect(parseAgentPolicy({ delete_everything: true }).ok).toBe(false);
    expect(parseAgentPolicy({ exclusions: { drop_tables: true } }).ok).toBe(false);
  });

  it("rejects non-primitive provider configuration values", () => {
    expect(parseAgentPolicy({ configuration: { nested: { a: 1 } } }).ok).toBe(false);
  });

  it("rejects an invalid risk threshold", () => {
    expect(parseAgentPolicy({ risk_threshold: "apocalyptic" }).ok).toBe(false);
  });

  it("falls back to defaults when reading legacy/partial stored policies", () => {
    const policy = coerceStoredPolicy({ inactivity_threshold_days: 45, legacy_field: 1 });
    expect(policy.inactivity_threshold_days).toBe(45);
    expect(policy.minimum_confidence).toBe(DEFAULT_AGENT_POLICY.minimum_confidence);
    expect(coerceStoredPolicy(null)).toEqual(DEFAULT_AGENT_POLICY);
  });
});
