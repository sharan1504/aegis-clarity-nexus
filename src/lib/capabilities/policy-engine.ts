// Provider-neutral policy evaluation. Client-safe and pure (no I/O), so it is
// fully unit-testable and can never reach a provider API or credential.
//
//   Agent -> Capability -> Normalized facts -> POLICY EVALUATION -> Agent reasoning
//
// This is the ONLY place where "90 days" becomes "inactive". Connectors report
// facts; agents reason over these verdicts. The engine itself makes no
// recommendation and performs no action.

import type { AgentPolicy, PolicyRevision } from "./policy";
import type { FreshnessState } from "./freshness";
import type { NormalizedEntitlement } from "./registry";

export type ExclusionReason =
  | "excluded_entitlement_id"
  | "excluded_user_email"
  | "active_queue_member"
  | "recently_provisioned";

export interface EntitlementVerdict {
  provider: string;
  integrationId: string;
  userId: string;
  entitlementId: string;
  /** Days since the provider's last observed activity; null when unknown. */
  inactivityDays: number | null;
  /** Policy verdict — derived here, never inside a connector. */
  unusedByPolicy: boolean;
  /** Whether policy exclusions removed this record from consideration. */
  excluded: boolean;
  exclusionReasons: ExclusionReason[];
  /** Threshold actually applied, echoed for auditability. */
  appliedThresholdDays: number;
  /** The exact facts the verdict was derived from. */
  evidence: {
    lastActivityAt: string | null;
    providerStatus: NormalizedEntitlement["status"];
    snapshotId: string | null;
    dataAsOf: string | null;
    source: string;
    freshness: FreshnessState;
  };
}

export interface PolicyEvaluationContext {
  /** Evaluation clock — injectable so evaluations are deterministic in tests. */
  now?: number;
  /** Users that are active members of a routing queue, for the queue exclusion. */
  activeQueueMemberUserIds?: Iterable<string>;
  /** Account creation timestamps by user id, for the provisioning exclusion. */
  provisionedAtByUserId?: Record<string, string | null | undefined>;
}

export interface PolicyEvaluation {
  policyVersion: number;
  policyRevision: PolicyRevision | null;
  appliedPolicy: AgentPolicy;
  evaluatedAt: string;
  verdicts: EntitlementVerdict[];
  summary: {
    total: number;
    unused: number;
    excluded: number;
    /** True when the number of candidates exceeds the policy ceiling. */
    exceedsMaximumAffectedRecords: boolean;
    approvalRequired: boolean;
  };
}

const DAY_MS = 86_400_000;

export function daysBetween(from: string | null, now: number): number | null {
  if (!from) return null;
  const ts = new Date(from).getTime();
  if (Number.isNaN(ts)) return null;
  return Math.floor(Math.max(0, now - ts) / DAY_MS);
}

/**
 * Applies one tenant policy to normalized entitlement facts.
 * The policy comes from the binding (tenant + agent + integration + capability),
 * so two integrations under the same agent can evaluate differently.
 */
export function evaluateEntitlementPolicy(
  records: NormalizedEntitlement[],
  policy: AgentPolicy,
  revision: PolicyRevision | null = null,
  context: PolicyEvaluationContext = {},
): PolicyEvaluation {
  const now = context.now ?? Date.now();
  const queueMembers = new Set(context.activeQueueMemberUserIds ?? []);
  const excludedEntitlements = new Set(policy.exclusions.excluded_entitlement_ids);
  const excludedEmails = new Set(policy.exclusions.excluded_user_emails.map((e) => e.toLowerCase()));
  const provisionedAt = context.provisionedAtByUserId ?? {};

  const verdicts = records.map<EntitlementVerdict>((record) => {
    const inactivityDays = daysBetween(record.lastActivityAt, now);
    const reasons: ExclusionReason[] = [];

    if (excludedEntitlements.has(record.entitlementId)) reasons.push("excluded_entitlement_id");
    if (record.userEmail && excludedEmails.has(record.userEmail.toLowerCase()))
      reasons.push("excluded_user_email");
    if (policy.exclusions.exclude_active_queue_members && queueMembers.has(record.userId))
      reasons.push("active_queue_member");

    const provisionWindow = policy.exclusions.exclude_recently_provisioned_days;
    if (provisionWindow > 0) {
      const age = daysBetween(provisionedAt[record.userId] ?? null, now);
      if (age !== null && age < provisionWindow) reasons.push("recently_provisioned");
    }

    // Unknown activity is treated as "no observed activity", i.e. it satisfies
    // the threshold. Whether to act on that is the agent's problem, not ours.
    const overThreshold =
      inactivityDays === null || inactivityDays >= policy.inactivity_threshold_days;

    return {
      provider: record.provider,
      integrationId: record.integrationId,
      userId: record.userId,
      entitlementId: record.entitlementId,
      inactivityDays,
      unusedByPolicy: overThreshold && reasons.length === 0,
      excluded: reasons.length > 0,
      exclusionReasons: reasons,
      appliedThresholdDays: policy.inactivity_threshold_days,
      evidence: {
        lastActivityAt: record.lastActivityAt,
        providerStatus: record.status,
        snapshotId: record.provenance.snapshotId,
        dataAsOf: record.provenance.dataAsOf,
        source: record.provenance.source,
        freshness: record.provenance.freshness,
      },
    };
  });

  const unused = verdicts.filter((v) => v.unusedByPolicy).length;

  return {
    policyVersion: revision?.version ?? 1,
    policyRevision: revision,
    appliedPolicy: policy,
    evaluatedAt: new Date(now).toISOString(),
    verdicts,
    summary: {
      total: verdicts.length,
      unused,
      excluded: verdicts.filter((v) => v.excluded).length,
      exceedsMaximumAffectedRecords: unused > policy.maximum_affected_records,
      approvalRequired: policy.approval_required,
    },
  };
}

/**
 * Evaluates one capability result made of several integrations, each with its
 * own binding policy. Provider identity is irrelevant here by design.
 */
export function evaluateEntitlementPolicyPerIntegration(
  records: NormalizedEntitlement[],
  policiesByIntegrationId: Record<string, { policy: AgentPolicy; revision: PolicyRevision | null }>,
  context: PolicyEvaluationContext = {},
): Record<string, PolicyEvaluation> {
  const grouped = new Map<string, NormalizedEntitlement[]>();
  for (const record of records) {
    const list = grouped.get(record.integrationId) ?? [];
    list.push(record);
    grouped.set(record.integrationId, list);
  }

  const out: Record<string, PolicyEvaluation> = {};
  for (const [integrationId, group] of grouped) {
    const entry = policiesByIntegrationId[integrationId];
    if (!entry) continue;
    out[integrationId] = evaluateEntitlementPolicy(group, entry.policy, entry.revision, context);
  }
  return out;
}
