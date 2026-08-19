// License analysis — pure, provider-neutral, side-effect free.
//
//   capability router (facts) + policy engine (verdicts) -> THIS MODULE -> JSON
//
// No I/O, no provider names hard-coded, no thresholds invented here: every
// threshold, exclusion and ceiling arrives from the binding's AgentPolicy.
// Client-safe so the whole analysis surface is unit-testable.

import type { FreshnessState } from "@/lib/capabilities/freshness";
import type { AgentPolicy, RiskThreshold } from "@/lib/capabilities/policy";
import { daysBetween, type PolicyEvaluation } from "@/lib/capabilities/policy-engine";
import type {
  NormalizedEntitlement,
  NormalizedUser,
  RecordProvenance,
} from "@/lib/capabilities/registry";

import type {
  InconclusiveRecord,
  LicenseAssignment,
  LicenseAssignmentPage,
  LicenseFilters,
  LicenseSummary,
  LicenseTypeUsage,
  LicenseUsage,
  ProvenanceRef,
  ReclamationRecommendation,
  UnusedLicenseCandidates,
  UserLicenseDetails,
} from "./types";

const RISK_RANK: Record<RiskThreshold, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function toProvenance(p: RecordProvenance): ProvenanceRef {
  return {
    provider: p.provider,
    integrationId: p.integrationId,
    sourceSystem: p.sourceSystem,
    source: p.source,
    snapshotId: p.snapshotId,
    syncId: p.syncId,
    dataAsOf: p.dataAsOf,
    lastSuccessfulSyncAt: p.lastSuccessfulSyncAt,
    freshness: p.freshness,
  };
}

function matchesText(value: string | null | undefined, needle: string): boolean {
  if (!value) return false;
  return value.toLowerCase().includes(needle.toLowerCase());
}

function matchesUserName(value: string | null | undefined, needle: string): boolean {
  return matchesText(value, needle);
}

function matchesUserFilter(
  e: NormalizedEntitlement,
  filters: LicenseFilters,
): boolean {
  if (filters.userId && e.userId !== filters.userId) return false;
  if (filters.userEmail && (e.userEmail ?? "").toLowerCase() !== filters.userEmail.toLowerCase()) return false;
  if (filters.userName && !matchesUserName(e.userName, filters.userName)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// get_license_summary / get_license_usage
// ---------------------------------------------------------------------------

function usageRows(entitlements: NormalizedEntitlement[]): LicenseTypeUsage[] {
  const byLicense = new Map<string, LicenseTypeUsage>();
  for (const e of entitlements) {
    const row =
      byLicense.get(e.entitlementId) ??
      ({
        licenseId: e.entitlementId,
        licenseName: e.entitlementName,
        assignmentCount: 0,
        activeUserCount: 0,
        inactiveUserCount: 0,
        unknownStateUserCount: 0,
        usersWithoutActivityData: 0,
      } satisfies LicenseTypeUsage);

    row.assignmentCount += 1;
    if (e.status === "active") row.activeUserCount += 1;
    else if (e.status === "inactive") row.inactiveUserCount += 1;
    else row.unknownStateUserCount += 1;
    if (!e.lastActivityAt) row.usersWithoutActivityData += 1;
    if (!row.licenseName && e.entitlementName) row.licenseName = e.entitlementName;

    byLicense.set(e.entitlementId, row);
  }
  return [...byLicense.values()].sort((a, b) => b.assignmentCount - a.assignmentCount);
}

export function buildLicenseSummary(
  entitlements: NormalizedEntitlement[],
  users: NormalizedUser[],
): LicenseSummary {
  const rows = usageRows(entitlements);

  const byUser = new Map<string, { userName: string | null; userEmail: string | null; licenseIds: Set<string> }>();
  for (const e of entitlements) {
    const entry =
      byUser.get(e.userId) ??
      { userName: e.userName, userEmail: e.userEmail, licenseIds: new Set<string>() };
    entry.licenseIds.add(e.entitlementId);
    if (!entry.userName && e.userName) entry.userName = e.userName;
    if (!entry.userEmail && e.userEmail) entry.userEmail = e.userEmail;
    byUser.set(e.userId, entry);
  }

  const multi = [...byUser.entries()]
    .filter(([, v]) => v.licenseIds.size > 1)
    .map(([userId, v]) => ({
      userId,
      userName: v.userName,
      userEmail: v.userEmail,
      licenseCount: v.licenseIds.size,
      licenseIds: [...v.licenseIds],
    }))
    .sort((a, b) => b.licenseCount - a.licenseCount);

  const totalUsers = users.length > 0 ? users.length : byUser.size;

  return {
    totalUsers,
    totalAssignments: entitlements.length,
    totalLicenseTypes: rows.length,
    assignmentsByLicenseType: rows,
    usersWithMultipleLicenses: multi,
    usersWithMultipleLicenseCount: multi.length,
  };
}

export function buildLicenseUsage(
  entitlements: NormalizedEntitlement[],
  filters: LicenseFilters,
): LicenseUsage {
  const filtered = entitlements.filter((e) => {
    if (filters.licenseId && e.entitlementId !== filters.licenseId) return false;
    if (filters.licenseName && !matchesText(e.entitlementName, filters.licenseName)) return false;
    if (!matchesUserFilter(e, filters)) return false;
    return true;
  });
  const licenses = usageRows(filtered);
  return { licenses, matchedLicenseTypes: licenses.length };
}

// ---------------------------------------------------------------------------
// get_license_assignments
// ---------------------------------------------------------------------------

export function buildLicenseAssignments(
  entitlements: NormalizedEntitlement[],
  filters: LicenseFilters,
  now: number,
  limit: number,
): LicenseAssignmentPage {
  const matched = entitlements.filter((e) => {
    if (filters.licenseId && e.entitlementId !== filters.licenseId) return false;
    if (filters.licenseName && !matchesText(e.entitlementName, filters.licenseName)) return false;
    if (!matchesUserFilter(e, filters)) return false;
    return true;
  });

  const assignments: LicenseAssignment[] = matched.slice(0, limit).map((e) => ({
    userId: e.userId,
    userName: e.userName,
    userEmail: e.userEmail,
    licenseId: e.entitlementId,
    licenseName: e.entitlementName,
    providerStatus: e.status,
    lastActivityAt: e.lastActivityAt,
    inactivityDays: daysBetween(e.lastActivityAt, now),
    provenance: toProvenance(e.provenance),
  }));

  return { assignments, totalMatched: matched.length };
}

// ---------------------------------------------------------------------------
// get_user_license_details
// ---------------------------------------------------------------------------

export function buildUserLicenseDetails(
  users: NormalizedUser[],
  entitlements: NormalizedEntitlement[],
  filters: LicenseFilters,
  now: number,
): UserLicenseDetails | null {
  const wantEmail = filters.userEmail?.toLowerCase();
  const user =
    users.find(
      (u) =>
        (filters.userId && u.userId === filters.userId) ||
        (wantEmail && (u.userEmail ?? "").toLowerCase() === wantEmail) ||
        (filters.userName && matchesUserName(u.userName, filters.userName)),
    ) ?? null;

  const owned = entitlements.filter(
    (e) =>
      (filters.userId && e.userId === filters.userId) ||
      (wantEmail && (e.userEmail ?? "").toLowerCase() === wantEmail) ||
      (filters.userName && matchesUserName(e.userName, filters.userName)) ||
      (user && e.userId === user.userId),
  );

  if (!user && owned.length === 0) return null;

  const first = owned[0];
  const userId = user?.userId ?? first?.userId ?? filters.userId ?? "";
  const lastActivityAt = user?.lastActivityAt ?? first?.lastActivityAt ?? null;

  return {
    userId,
    userName: user?.userName ?? first?.userName ?? null,
    userEmail: user?.userEmail ?? first?.userEmail ?? filters.userEmail ?? null,
    providerStatus: user?.status ?? first?.status ?? null,
    lastActivityAt,
    inactivityDays: daysBetween(lastActivityAt, now),
    accountCreatedAt:
      (user?.metadata["accountCreatedAt"] as string | null | undefined) ??
      (first?.metadata["accountCreatedAt"] as string | null | undefined) ??
      null,
    licenses: owned.map((e) => ({
      licenseId: e.entitlementId,
      licenseName: e.entitlementName,
      lastActivityAt: e.lastActivityAt,
      inactivityDays: daysBetween(e.lastActivityAt, now),
      provenance: toProvenance(e.provenance),
    })),
    provenance: user ? toProvenance(user.provenance) : first ? toProvenance(first.provenance) : null,
  };
}

// ---------------------------------------------------------------------------
// get_unused_license_candidates
// ---------------------------------------------------------------------------

export interface CandidateOptions {
  now: number;
  queueMembershipAvailableByIntegration: Record<string, boolean>;
  freshnessByIntegration: Record<string, FreshnessState>;
}

function riskFor(
  inactivityDays: number,
  thresholdDays: number,
  freshness: FreshnessState,
): { risk: RiskThreshold; factors: string[] } {
  const factors: string[] = [];
  let rank = 1;
  const ratio = thresholdDays > 0 ? inactivityDays / thresholdDays : 1;
  if (ratio >= 2) {
    rank = 0;
    factors.push(`Inactive for at least twice the policy threshold (${thresholdDays} days).`);
  } else if (ratio >= 1.25) {
    rank = 1;
    factors.push(`Inactive well beyond the policy threshold of ${thresholdDays} days.`);
  } else {
    rank = 2;
    factors.push(`Only marginally beyond the policy threshold of ${thresholdDays} days.`);
  }
  if (freshness === "aging") {
    rank = Math.min(3, rank + 1);
    factors.push("Underlying data is aging.");
  } else if (freshness === "stale") {
    rank = Math.min(3, rank + 2);
    factors.push("Underlying data is stale.");
  }
  const risk = (Object.keys(RISK_RANK) as RiskThreshold[]).find((k) => RISK_RANK[k] === rank)!;
  return { risk, factors };
}

function confidenceFor(
  inactivityDays: number,
  thresholdDays: number,
  freshness: FreshnessState,
): number {
  let score = 100;
  const ratio = thresholdDays > 0 ? inactivityDays / thresholdDays : 1;
  if (ratio < 1.25) score -= 10;
  if (freshness === "aging") score -= 5;
  if (freshness === "stale") score -= 25;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function buildUnusedLicenseCandidates(
  entitlements: NormalizedEntitlement[],
  evaluations: Record<string, PolicyEvaluation>,
  policies: Record<string, { policy: AgentPolicy; version: number }>,
  options: CandidateOptions,
): { payload: UnusedLicenseCandidates; warnings: string[] } {
  const warnings: string[] = [];
  const recommendations: ReclamationRecommendation[] = [];
  const inconclusive: InconclusiveRecord[] = [];
  let excludedCount = 0;
  let evaluated = 0;

  const entitlementIndex = new Map(
    entitlements.map((e) => [`${e.integrationId}::${e.userId}::${e.entitlementId}`, e]),
  );

  const appliedPolicyByIntegration: UnusedLicenseCandidates["appliedPolicyByIntegration"] = {};

  for (const [integrationId, evaluation] of Object.entries(evaluations)) {
    const policyEntry = policies[integrationId];
    if (!policyEntry) continue;
    const { policy } = policyEntry;
    const freshness = options.freshnessByIntegration[integrationId] ?? "unavailable";
    const queueDataAvailable = options.queueMembershipAvailableByIntegration[integrationId] ?? false;

    appliedPolicyByIntegration[integrationId] = {
      version: policyEntry.version,
      inactivityThresholdDays: policy.inactivity_threshold_days,
      minimumConfidence: policy.minimum_confidence,
    };

    if (policy.exclusions.exclude_active_queue_members && !queueDataAvailable) {
      warnings.push("Queue membership data is unavailable, so no assignment can be cleared of the active-queue-member exclusion.");
    }

    for (const verdict of evaluation.verdicts) {
      evaluated += 1;
      const record = entitlementIndex.get(`${verdict.integrationId}::${verdict.userId}::${verdict.entitlementId}`);
      const email = record?.userEmail ?? null;

      if (verdict.excluded) {
        excludedCount += 1;
        inconclusive.push({ userId: verdict.userId, email, licenseId: verdict.entitlementId, code: "excluded_by_policy", reason: `Excluded by policy (${verdict.exclusionReasons.join(", ")}).` });
        continue;
      }
      if (verdict.inactivityDays === null || !verdict.evidence.lastActivityAt) {
        inconclusive.push({ userId: verdict.userId, email, licenseId: verdict.entitlementId, code: "missing_activity_data", reason: "No last-activity timestamp is available for this user, so reclamation eligibility cannot be determined." });
        continue;
      }
      if (freshness === "unavailable" || freshness === "stale") {
        inconclusive.push({ userId: verdict.userId, email, licenseId: verdict.entitlementId, code: "stale_data", reason: "The underlying data is not fresh enough to support a reclamation recommendation." });
        continue;
      }
      if (policy.exclusions.exclude_active_queue_members && !queueDataAvailable) {
        inconclusive.push({ userId: verdict.userId, email, licenseId: verdict.entitlementId, code: "missing_activity_data", reason: "The policy excludes active queue members, but queue membership data is unavailable for this data source." });
        continue;
      }
      if (!verdict.unusedByPolicy) {
        inconclusive.push({ userId: verdict.userId, email, licenseId: verdict.entitlementId, code: "below_threshold", reason: `Activity is within the policy threshold of ${verdict.appliedThresholdDays} days.` });
        continue;
      }
      const confidence = confidenceFor(verdict.inactivityDays, verdict.appliedThresholdDays, freshness);
      if (confidence < policy.minimum_confidence) {
        inconclusive.push({ userId: verdict.userId, email, licenseId: verdict.entitlementId, code: "below_minimum_confidence", reason: `Confidence ${confidence} is below the policy minimum of ${policy.minimum_confidence}.` });
        continue;
      }
      const { risk, factors } = riskFor(verdict.inactivityDays, verdict.appliedThresholdDays, freshness);
      if (RISK_RANK[risk] > RISK_RANK[policy.risk_threshold]) {
        inconclusive.push({ userId: verdict.userId, email, licenseId: verdict.entitlementId, code: "below_minimum_confidence", reason: `Assessed risk "${risk}" exceeds the policy risk threshold "${policy.risk_threshold}".` });
        continue;
      }

      recommendations.push({
        user: record?.userName ?? null,
        userId: verdict.userId,
        email,
        license: record?.entitlementName ?? null,
        licenseId: verdict.entitlementId,
        lastActivityAt: verdict.evidence.lastActivityAt,
        inactivityDays: verdict.inactivityDays,
        policyThresholdDays: verdict.appliedThresholdDays,
        reason: `No activity for ${verdict.inactivityDays} days, exceeding the configured inactivity threshold of ${verdict.appliedThresholdDays} days.`,
        confidence,
        risk,
        riskFactors: factors,
        approvalRequired: policy.approval_required,
        provenance: record ? toProvenance(record.provenance) : {
          provider: verdict.provider,
          integrationId: verdict.integrationId,
          sourceSystem: verdict.provider,
          source: verdict.evidence.source,
          snapshotId: verdict.evidence.snapshotId,
          syncId: null,
          dataAsOf: verdict.evidence.dataAsOf,
          lastSuccessfulSyncAt: null,
          freshness: verdict.evidence.freshness,
        },
        dataFreshness: freshness,
      });
    }
  }

  recommendations.sort((a, b) => b.inactivityDays - a.inactivityDays);
  const ceiling = Math.min(...Object.values(policies).map((p) => p.policy.maximum_affected_records), Number.MAX_SAFE_INTEGER);
  const exceeded = recommendations.length > ceiling;
  const capped = exceeded ? recommendations.slice(0, ceiling) : recommendations;
  if (exceeded) warnings.push(`Recommendations were limited to the policy maximum of ${ceiling} affected records.`);

  return {
    payload: {
      recommendations: capped,
      inconclusive,
      excludedCount,
      evaluatedAssignments: evaluated,
      policyCeilingExceeded: exceeded,
      appliedPolicyByIntegration,
    },
    warnings,
  };
}
