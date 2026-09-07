import { describe, expect, it } from "vitest";
import { DEFAULT_AGENT_POLICY, type AgentPolicy } from "./policy";
import { evaluateSecurityFindingPolicy, type NormalizedSecurityFinding } from "./security-policy-engine";

const provenance = { provider: "github", integrationId: "gh-1", sourceSystem: "GitHub", source: "github_synced_entities", snapshotId: "snap-1", syncId: "sync-1", dataAsOf: "2026-09-07T00:00:00Z", lastSuccessfulSyncAt: "2026-09-07T00:00:00Z", freshness: "fresh" as const };
function finding(id: string, severity: NormalizedSecurityFinding["severity"], repo = "acme/api"): NormalizedSecurityFinding { return { provider: "github", integrationId: "gh-1", findingId: id, repositoryName: repo, findingType: "dependabot", title: id, severity, state: "open", url: `https://github.com/${repo}/security`, providerUpdatedAt: "2026-09-07T00:00:00Z", metadata: {}, provenance }; }
function policy(overrides: Partial<AgentPolicy> = {}): AgentPolicy { return { ...DEFAULT_AGENT_POLICY, maximum_affected_records: 2, risk_threshold: "high", configuration: {}, ...overrides }; }

describe("evaluateSecurityFindingPolicy", () => {
  it("applies severity threshold deterministically", () => {
    const result = evaluateSecurityFindingPolicy([finding("low", "low"), finding("high", "high"), finding("critical", "critical")], policy(), null, Date.parse("2026-09-07T10:00:00Z"));
    expect(result.recommendations.map((v) => v.findingId)).toEqual(["critical", "high"]);
    expect(result.verdicts.find((v) => v.findingId === "low")?.reason).toBe("below_severity_threshold");
  });
  it("excludes accepted-risk findings without provider-specific logic", () => {
    const p = policy({ configuration: { security_accepted_risk_keys: "accepted,acme/api::ignored" } });
    const result = evaluateSecurityFindingPolicy([finding("ignored", "critical"), finding("accepted", "critical")], p, null, 0);
    expect(result.recommendations).toHaveLength(0);
    expect(result.verdicts.every((v) => v.reason === "accepted_risk")).toBe(true);
  });
  it("enforces the per-repository ceiling", () => {
    const result = evaluateSecurityFindingPolicy([finding("a", "critical"), finding("b", "critical"), finding("c", "critical")], policy(), null, 0);
    expect(result.recommendations).toHaveLength(2);
    expect(result.summary.exceededRepositoryCeiling).toBe(true);
    expect(result.verdicts.at(-1)?.reason).toBe("repository_ceiling");
  });
  it("does not recommend unknown severity", () => {
    const result = evaluateSecurityFindingPolicy([finding("unknown", "unknown")], policy(), null, 0);
    expect(result.recommendations).toHaveLength(0);
    expect(result.verdicts[0].reason).toBe("unknown_severity");
  });
});
