import { describe, expect, it } from "vitest";

import { DEFAULT_AGENT_POLICY, type AgentPolicy } from "./policy";
import {
  evaluateEntitlementPolicy,
  evaluateEntitlementPolicyPerIntegration,
} from "./policy-engine";
import type { NormalizedEntitlement } from "./registry";

const NOW = new Date("2026-08-17T00:00:00.000Z").getTime();
const DAY = 86_400_000;

function entitlement(
  overrides: Partial<NormalizedEntitlement> & { userId: string; lastActivityAt: string | null },
): NormalizedEntitlement {
  return {
    provider: "genesys",
    integrationId: "int-1",
    userName: "User",
    userEmail: `${overrides.userId}@example.com`,
    entitlementId: "lic-1",
    entitlementName: "Genesys Cloud CX 3",
    status: "active",
    metadata: {},
    provenance: {
      provider: "genesys",
      integrationId: overrides.integrationId ?? "int-1",
      sourceSystem: "Genesys Cloud",
      source: "genesys_user_licenses",
      snapshotId: "snap-1",
      syncId: "sync-1",
      dataAsOf: new Date(NOW - 5 * 60_000).toISOString(),
      lastSuccessfulSyncAt: new Date(NOW - 5 * 60_000).toISOString(),
      freshness: "fresh",
    },
    ...overrides,
  } as NormalizedEntitlement;
}

describe("policy evaluation (interpretation lives here, not in the connector)", () => {
  const records = [
    entitlement({ userId: "u-old", lastActivityAt: new Date(NOW - 120 * DAY).toISOString() }),
    entitlement({ userId: "u-recent", lastActivityAt: new Date(NOW - 10 * DAY).toISOString() }),
    entitlement({ userId: "u-unknown", lastActivityAt: null }),
  ];

  it("applies the inactivity threshold", () => {
    const result = evaluateEntitlementPolicy(records, DEFAULT_AGENT_POLICY, null, { now: NOW });
    const byUser = Object.fromEntries(result.verdicts.map((v) => [v.userId, v]));
    expect(byUser["u-old"]?.unusedByPolicy).toBe(true);
    expect(byUser["u-old"]?.inactivityDays).toBe(120);
    expect(byUser["u-recent"]?.unusedByPolicy).toBe(false);
    expect(byUser["u-unknown"]?.inactivityDays).toBeNull();
    expect(result.summary.unused).toBe(2);
  });

  it("changes verdicts when the threshold changes", () => {
    const strict: AgentPolicy = { ...DEFAULT_AGENT_POLICY, inactivity_threshold_days: 5 };
    const result = evaluateEntitlementPolicy(records, strict, null, { now: NOW });
    expect(result.verdicts.every((v) => v.unusedByPolicy)).toBe(true);
    expect(result.verdicts[0]?.appliedThresholdDays).toBe(5);
  });

  it("honours exclusions", () => {
    const policy: AgentPolicy = {
      ...DEFAULT_AGENT_POLICY,
      exclusions: {
        ...DEFAULT_AGENT_POLICY.exclusions,
        exclude_active_queue_members: true,
        excluded_user_emails: ["u-old@example.com"],
      },
    };
    const result = evaluateEntitlementPolicy(records, policy, null, {
      now: NOW,
      activeQueueMemberUserIds: ["u-unknown"],
    });
    const byUser = Object.fromEntries(result.verdicts.map((v) => [v.userId, v]));
    expect(byUser["u-old"]?.exclusionReasons).toContain("excluded_user_email");
    expect(byUser["u-old"]?.unusedByPolicy).toBe(false);
    expect(byUser["u-unknown"]?.exclusionReasons).toContain("active_queue_member");
    expect(result.summary.excluded).toBe(2);
  });

  it("flags results that exceed the maximum affected records ceiling", () => {
    const policy: AgentPolicy = { ...DEFAULT_AGENT_POLICY, maximum_affected_records: 1 };
    const result = evaluateEntitlementPolicy(records, policy, null, { now: NOW });
    expect(result.summary.exceedsMaximumAffectedRecords).toBe(true);
    expect(result.summary.approvalRequired).toBe(true);
  });

  it("carries the policy version and evidence provenance into every verdict", () => {
    const result = evaluateEntitlementPolicy(records, DEFAULT_AGENT_POLICY, {
      version: 7,
      updatedAt: "2026-08-01T00:00:00.000Z",
      updatedBy: "user-1",
    });
    expect(result.policyVersion).toBe(7);
    expect(result.verdicts[0]?.evidence.snapshotId).toBe("snap-1");
    expect(result.verdicts[0]?.evidence.source).toBe("genesys_user_licenses");
  });

  it("evaluates different integrations under different policies", () => {
    const genesysRecords = [
      entitlement({
        userId: "g-1",
        integrationId: "int-genesys",
        lastActivityAt: new Date(NOW - 70 * DAY).toISOString(),
      }),
    ];
    const otherRecords = [
      entitlement({
        userId: "m-1",
        integrationId: "int-m365",
        provider: "microsoft365",
        lastActivityAt: new Date(NOW - 70 * DAY).toISOString(),
      }),
    ];

    const evaluations = evaluateEntitlementPolicyPerIntegration(
      [...genesysRecords, ...otherRecords],
      {
        "int-genesys": {
          policy: { ...DEFAULT_AGENT_POLICY, inactivity_threshold_days: 90 },
          revision: null,
        },
        "int-m365": {
          policy: { ...DEFAULT_AGENT_POLICY, inactivity_threshold_days: 60 },
          revision: null,
        },
      },
      { now: NOW },
    );

    expect(evaluations["int-genesys"]?.verdicts[0]?.unusedByPolicy).toBe(false);
    expect(evaluations["int-m365"]?.verdicts[0]?.unusedByPolicy).toBe(true);
  });
});
