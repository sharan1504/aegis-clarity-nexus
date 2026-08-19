// License Agent contracts. Client-safe: types + filter validation only.
//
// The License Agent is an ANALYSIS layer. It never talks to a provider, never
// holds credentials and never mutates anything. It consumes provider-neutral
// facts from the capability router and policy verdicts from the policy engine,
// and returns structured JSON.

import type { FreshnessState } from "@/lib/capabilities/freshness";
import type { AgentPolicy, RiskThreshold } from "@/lib/capabilities/policy";
import type { CapabilitySource } from "@/lib/capabilities/registry";

export const LICENSE_AGENT_KEY = "agent-license";

export type LicenseOperation =
  | "get_license_summary"
  | "get_license_usage"
  | "get_license_assignments"
  | "get_unused_license_candidates"
  | "get_user_license_details";

export const LICENSE_OPERATIONS: LicenseOperation[] = [
  "get_license_summary",
  "get_license_usage",
  "get_license_assignments",
  "get_unused_license_candidates",
  "get_user_license_details",
];

/** Read-only by construction: no operation in this agent may mutate. */
export const LICENSE_OPERATION_ACTIONS: Record<LicenseOperation, string> = {
  get_license_summary: "agent.license.get_license_summary",
  get_license_usage: "agent.license.get_license_usage",
  get_license_assignments: "agent.license.get_license_assignments",
  get_unused_license_candidates: "agent.license.get_unused_license_candidates",
  get_user_license_details: "agent.license.get_user_license_details",
};

export type LicenseErrorCode =
  | "capability_denied"
  | "guardrail_denied"
  | "provider_unavailable"
  | "stale_data"
  | "missing_activity_data"
  | "invalid_filters"
  | "maximum_records_exceeded"
  | "not_found"
  | "unavailable";

export const LICENSE_ERROR_MESSAGES: Record<LicenseErrorCode, string> = {
  capability_denied: "This agent is not authorized to read the required license data.",
  guardrail_denied: "A guardrail prevented this analysis from running.",
  provider_unavailable: "No connected data source could supply license data.",
  stale_data: "The license data is too old to analyze safely. Run a synchronization first.",
  missing_activity_data: "Required activity data is unavailable, so no conclusion can be drawn.",
  invalid_filters: "The supplied filters are not valid.",
  maximum_records_exceeded: "The result exceeds the policy's maximum affected records.",
  not_found: "No matching record was found in the current snapshot.",
  unavailable: "The license analysis could not be completed.",
};

export interface FilterIssue {
  field: string;
  message: string;
}

export interface ProvenanceRef {
  provider: string;
  integrationId: string;
  sourceSystem: string;
  source: string;
  snapshotId: string | null;
  syncId: string | null;
  dataAsOf: string | null;
  lastSuccessfulSyncAt: string | null;
  freshness: FreshnessState;
}

/** Metadata attached to every response, denied or not. */
export interface LicenseResultMeta {
  operation: LicenseOperation;
  evaluatedAt: string;
  freshness: FreshnessState;
  sources: CapabilitySource[];
  warnings: string[];
  /** Policy in force per integration, echoed for auditability. */
  policies: Record<string, { version: number; policy: AgentPolicy }>;
  /** True when a guardrail or policy ceiling truncated the payload. */
  truncated: boolean;
  readOnly: true;
}

export type LicenseResult<T> =
  | { ok: true; data: T; meta: LicenseResultMeta }
  | {
      ok: false;
      error: { code: LicenseErrorCode; message: string; issues: FilterIssue[] };
      meta: LicenseResultMeta;
    };

// --- Operation payloads ----------------------------------------------------

export interface LicenseTypeUsage {
  licenseId: string;
  licenseName: string | null;
  assignmentCount: number;
  activeUserCount: number;
  inactiveUserCount: number;
  unknownStateUserCount: number;
  usersWithoutActivityData: number;
}

export interface LicenseSummary {
  totalUsers: number;
  totalAssignments: number;
  totalLicenseTypes: number;
  assignmentsByLicenseType: LicenseTypeUsage[];
  usersWithMultipleLicenses: Array<{
    userId: string;
    userName: string | null;
    userEmail: string | null;
    licenseCount: number;
    licenseIds: string[];
  }>;
  usersWithMultipleLicenseCount: number;
}

export interface LicenseUsage {
  licenses: LicenseTypeUsage[];
  matchedLicenseTypes: number;
}

export interface LicenseAssignment {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  licenseId: string;
  licenseName: string | null;
  providerStatus: "active" | "inactive" | "unknown";
  lastActivityAt: string | null;
  inactivityDays: number | null;
  provenance: ProvenanceRef;
}

export interface LicenseAssignmentPage {
  assignments: LicenseAssignment[];
  totalMatched: number;
}

export interface UserLicenseDetails {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  providerStatus: string | null;
  lastActivityAt: string | null;
  inactivityDays: number | null;
  accountCreatedAt: string | null;
  licenses: Array<{
    licenseId: string;
    licenseName: string | null;
    lastActivityAt: string | null;
    inactivityDays: number | null;
    provenance: ProvenanceRef;
  }>;
  provenance: ProvenanceRef | null;
}

export interface ReclamationRecommendation {
  user: string | null;
  userId: string;
  email: string | null;
  license: string | null;
  licenseId: string;
  lastActivityAt: string | null;
  inactivityDays: number;
  policyThresholdDays: number;
  reason: string;
  confidence: number;
  risk: RiskThreshold;
  riskFactors: string[];
  approvalRequired: boolean;
  provenance: ProvenanceRef;
  dataFreshness: FreshnessState;
}

/** A record that could NOT be concluded on, and why. Never a recommendation. */
export interface InconclusiveRecord {
  userId: string;
  email: string | null;
  licenseId: string;
  code: LicenseErrorCode | "excluded_by_policy" | "below_threshold" | "below_minimum_confidence";
  reason: string;
}

export interface UnusedLicenseCandidates {
  recommendations: ReclamationRecommendation[];
  inconclusive: InconclusiveRecord[];
  excludedCount: number;
  evaluatedAssignments: number;
  policyCeilingExceeded: boolean;
  appliedPolicyByIntegration: Record<
    string,
    { version: number; inactivityThresholdDays: number; minimumConfidence: number }
  >;
}

// --- Filters ---------------------------------------------------------------

export interface LicenseFilters {
  licenseId?: string;
  licenseName?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
}

const MAX_FILTER_LENGTH = 320;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates untrusted filter input. Unknown or malformed values are rejected. */
export function parseLicenseFilters(
  input: unknown,
  allowed: Array<keyof LicenseFilters>,
): { ok: true; filters: LicenseFilters } | { ok: false; issues: FilterIssue[] } {
  const issues: FilterIssue[] = [];
  if (input === undefined || input === null) return { ok: true, filters: {} };
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, issues: [{ field: "filters", message: "Filters must be an object." }] };
  }

  const raw = input as Record<string, unknown>;
  const filters: LicenseFilters = {};
  const allowedSet = new Set<string>(allowed);

  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null || value === "") continue;
    if (!allowedSet.has(key)) {
      issues.push({ field: key, message: `"${key}" is not a supported filter here.` });
      continue;
    }
    if (typeof value !== "string") {
      issues.push({ field: key, message: `${key} must be text.` });
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_FILTER_LENGTH) {
      issues.push({ field: key, message: `${key} is too long.` });
      continue;
    }
    if (key === "userEmail" && !EMAIL_RE.test(trimmed)) {
      issues.push({ field: "userEmail", message: "userEmail must be a valid email address." });
      continue;
    }
    filters[key as keyof LicenseFilters] = trimmed;
  }

  if (issues.length) return { ok: false, issues };
  return { ok: true, filters };
}
