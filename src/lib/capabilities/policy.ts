// Typed agent↔integration policy schema + validation. Client-safe.
//
// POLICY = organization-specific decision rules (thresholds, criteria,
// exclusions, approval requirements). Policies live on the binding
// (tenant + agent + integration + capability) and are NEVER hard-coded into a
// provider connector.
//
// The browser may propose a policy but can never bypass validation: every
// write path runs `parseAgentPolicy` server-side and rejects invalid values.

export type PolicyPrimitive = string | number | boolean | null;

export type RiskThreshold = "low" | "medium" | "high" | "critical";

export const RISK_THRESHOLDS: RiskThreshold[] = ["low", "medium", "high", "critical"];

export interface PolicyExclusions {
  /** Do not consider users who are active members of a routing queue. */
  exclude_active_queue_members: boolean;
  /** Ignore accounts provisioned within this many days (0 disables). */
  exclude_recently_provisioned_days: number;
  /** Entitlement IDs that must never be touched. */
  excluded_entitlement_ids: string[];
  /** User emails that must never be touched. */
  excluded_user_emails: string[];
}

export interface AgentPolicy {
  /** Days without activity before an entitlement is considered unused. */
  inactivity_threshold_days: number;
  /** 0-100. Minimum confidence a recommendation must reach to be surfaced. */
  minimum_confidence: number;
  /** Maximum records a single recommendation/change may affect. */
  maximum_affected_records: number;
  /** Highest risk level the agent may act on without escalation. */
  risk_threshold: RiskThreshold;
  /** Whether a human approval is mandatory before execution. */
  approval_required: boolean;
  exclusions: PolicyExclusions;
  /**
   * Controlled bag for provider-specific settings. Values are limited to JSON
   * primitives so no logic can be smuggled in.
   */
  configuration: Record<string, PolicyPrimitive>;
}

export const DEFAULT_AGENT_POLICY: AgentPolicy = {
  inactivity_threshold_days: 90,
  minimum_confidence: 95,
  maximum_affected_records: 500,
  risk_threshold: "medium",
  approval_required: true,
  exclusions: {
    exclude_active_queue_members: true,
    exclude_recently_provisioned_days: 30,
    excluded_entitlement_ids: [],
    excluded_user_emails: [],
  },
  configuration: {},
};

export interface PolicyIssue {
  field: string;
  message: string;
}

export type PolicyParseResult =
  | { ok: true; policy: AgentPolicy }
  | { ok: false; issues: PolicyIssue[] };

const MAX_CONFIG_KEYS = 25;
const MAX_LIST_ITEMS = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInt(
  value: unknown,
  field: string,
  issues: PolicyIssue[],
  fallback: number,
  { max, allowZero = false }: { max: number; allowZero?: boolean },
): number {
  if (value === undefined || value === null) return fallback;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    issues.push({ field, message: `${field} must be a whole number.` });
    return fallback;
  }
  if (n < (allowZero ? 0 : 1)) {
    issues.push({
      field,
      message: `${field} must be ${allowZero ? "zero or greater" : "a positive integer"}.`,
    });
    return fallback;
  }
  if (n > max) {
    issues.push({ field, message: `${field} must be ${max} or less.` });
    return fallback;
  }
  return n;
}

function stringList(value: unknown, field: string, issues: PolicyIssue[]): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    issues.push({ field, message: `${field} must be a list.` });
    return [];
  }
  if (value.length > MAX_LIST_ITEMS) {
    issues.push({ field, message: `${field} may not contain more than ${MAX_LIST_ITEMS} entries.` });
    return [];
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) {
      issues.push({ field, message: `${field} may only contain non-empty text values.` });
      return [];
    }
    out.push(item.trim().slice(0, 320));
  }
  return out;
}

/**
 * Validates untrusted policy input into a typed AgentPolicy.
 * Unknown top-level keys are rejected rather than silently stored, so the
 * policy surface stays a controlled contract.
 */
export function parseAgentPolicy(input: unknown): PolicyParseResult {
  const issues: PolicyIssue[] = [];
  if (input === undefined || input === null) return { ok: true, policy: DEFAULT_AGENT_POLICY };
  if (!isRecord(input)) {
    return { ok: false, issues: [{ field: "policy", message: "Policy must be an object." }] };
  }

  const allowed = new Set<string>([
    "inactivity_threshold_days",
    "minimum_confidence",
    "maximum_affected_records",
    "risk_threshold",
    "approval_required",
    "exclusions",
    "configuration",
  ]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      issues.push({ field: key, message: `"${key}" is not a supported policy field.` });
    }
  }

  const inactivity = positiveInt(
    input["inactivity_threshold_days"],
    "inactivity_threshold_days",
    issues,
    DEFAULT_AGENT_POLICY.inactivity_threshold_days,
    { max: 3650 },
  );

  let confidence = DEFAULT_AGENT_POLICY.minimum_confidence;
  const rawConfidence = input["minimum_confidence"];
  if (rawConfidence !== undefined && rawConfidence !== null) {
    const n = typeof rawConfidence === "number" ? rawConfidence : Number(rawConfidence);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      issues.push({ field: "minimum_confidence", message: "minimum_confidence must be 0-100." });
    } else {
      confidence = Math.round(n);
    }
  }

  const maxRecords = positiveInt(
    input["maximum_affected_records"],
    "maximum_affected_records",
    issues,
    DEFAULT_AGENT_POLICY.maximum_affected_records,
    { max: 1_000_000 },
  );

  let risk = DEFAULT_AGENT_POLICY.risk_threshold;
  const rawRisk = input["risk_threshold"];
  if (rawRisk !== undefined && rawRisk !== null) {
    if (typeof rawRisk !== "string" || !RISK_THRESHOLDS.includes(rawRisk as RiskThreshold)) {
      issues.push({
        field: "risk_threshold",
        message: `risk_threshold must be one of ${RISK_THRESHOLDS.join(", ")}.`,
      });
    } else {
      risk = rawRisk as RiskThreshold;
    }
  }

  let approvalRequired = DEFAULT_AGENT_POLICY.approval_required;
  const rawApproval = input["approval_required"];
  if (rawApproval !== undefined && rawApproval !== null) {
    if (typeof rawApproval !== "boolean") {
      issues.push({ field: "approval_required", message: "approval_required must be true/false." });
    } else {
      approvalRequired = rawApproval;
    }
  }

  const rawExclusions = input["exclusions"];
  const exclusions: PolicyExclusions = { ...DEFAULT_AGENT_POLICY.exclusions };
  if (rawExclusions !== undefined && rawExclusions !== null) {
    if (!isRecord(rawExclusions)) {
      issues.push({ field: "exclusions", message: "exclusions must be an object." });
    } else {
      const allowedExclusions = new Set<string>([
        "exclude_active_queue_members",
        "exclude_recently_provisioned_days",
        "excluded_entitlement_ids",
        "excluded_user_emails",
      ]);
      for (const key of Object.keys(rawExclusions)) {
        if (!allowedExclusions.has(key)) {
          issues.push({ field: `exclusions.${key}`, message: `"${key}" is not a supported exclusion.` });
        }
      }
      const rawQueueMembers = rawExclusions["exclude_active_queue_members"];
      if (rawQueueMembers !== undefined && rawQueueMembers !== null) {
        if (typeof rawQueueMembers !== "boolean") {
          issues.push({
            field: "exclusions.exclude_active_queue_members",
            message: "exclude_active_queue_members must be true/false.",
          });
        } else {
          exclusions.exclude_active_queue_members = rawQueueMembers;
        }
      }
      exclusions.exclude_recently_provisioned_days = positiveInt(
        rawExclusions["exclude_recently_provisioned_days"],
        "exclusions.exclude_recently_provisioned_days",
        issues,
        DEFAULT_AGENT_POLICY.exclusions.exclude_recently_provisioned_days,
        { max: 3650, allowZero: true },
      );
      exclusions.excluded_entitlement_ids = stringList(
        rawExclusions["excluded_entitlement_ids"],
        "exclusions.excluded_entitlement_ids",
        issues,
      );
      exclusions.excluded_user_emails = stringList(
        rawExclusions["excluded_user_emails"],
        "exclusions.excluded_user_emails",
        issues,
      ).map((e) => e.toLowerCase());
    }
  }

  const configuration: Record<string, PolicyPrimitive> = {};
  const rawConfig = input["configuration"];
  if (rawConfig !== undefined && rawConfig !== null) {
    if (!isRecord(rawConfig)) {
      issues.push({ field: "configuration", message: "configuration must be an object." });
    } else {
      const keys = Object.keys(rawConfig);
      if (keys.length > MAX_CONFIG_KEYS) {
        issues.push({
          field: "configuration",
          message: `configuration may not contain more than ${MAX_CONFIG_KEYS} keys.`,
        });
      } else {
        for (const key of keys) {
          const value = rawConfig[key];
          const validKey = /^[a-z0-9_]{1,64}$/.test(key);
          if (!validKey) {
            issues.push({
              field: `configuration.${key}`,
              message: "configuration keys must be lowercase letters, numbers and underscores.",
            });
            continue;
          }
          if (
            value === null ||
            typeof value === "boolean" ||
            typeof value === "number" ||
            typeof value === "string"
          ) {
            configuration[key] =
              typeof value === "string" ? value.slice(0, 500) : (value as PolicyPrimitive);
          } else {
            issues.push({
              field: `configuration.${key}`,
              message: "configuration values must be text, numbers, true/false or empty.",
            });
          }
        }
      }
    }
  }

  if (issues.length) return { ok: false, issues };

  return {
    ok: true,
    policy: {
      inactivity_threshold_days: inactivity,
      minimum_confidence: confidence,
      maximum_affected_records: maxRecords,
      risk_threshold: risk,
      approval_required: approvalRequired,
      exclusions,
      configuration,
    },
  };
}

/**
 * Reads a stored policy row (which may predate the typed schema) into a full
 * AgentPolicy, falling back to defaults for anything missing or invalid.
 * Never throws — used on read paths.
 */
export function coerceStoredPolicy(stored: unknown): AgentPolicy {
  if (!isRecord(stored)) return DEFAULT_AGENT_POLICY;
  const known: Record<string, unknown> = {};
  for (const key of [
    "inactivity_threshold_days",
    "minimum_confidence",
    "maximum_affected_records",
    "risk_threshold",
    "approval_required",
    "exclusions",
    "configuration",
  ]) {
    if (stored[key] !== undefined) known[key] = stored[key];
  }
  const parsed = parseAgentPolicy(known);
  return parsed.ok ? parsed.policy : DEFAULT_AGENT_POLICY;
}

/** Policy metadata captured so a future recommendation can cite its inputs. */
export interface PolicyRevision {
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
}
