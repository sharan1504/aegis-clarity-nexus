// GUARDRAILS — platform governance vocabulary + declarative condition schema.
//
// Client-safe. No credentials, no server imports, no executable rules.
//
// A guardrail is a MANDATORY platform control. It is not an instruction
// ("be careful") and not a policy ("inactive means >90 days"). It is a
// declarative condition + effect that the server evaluates before any
// protected operation, and that no agent, LLM, prompt, tool, connector,
// workflow or MCP call can bypass or weaken.

export type GuardrailScope =
  | "platform"
  | "organization"
  | "environment"
  | "agent"
  | "integration"
  | "capability"
  | "tool";

/** Deterministic precedence — lower index = higher authority. */
export const SCOPE_PRECEDENCE: GuardrailScope[] = [
  "platform",
  "organization",
  "environment",
  "agent",
  "integration",
  "capability",
  "tool",
];

export function scopeRank(scope: GuardrailScope): number {
  const index = SCOPE_PRECEDENCE.indexOf(scope);
  return index === -1 ? SCOPE_PRECEDENCE.length : index;
}

export const SCOPE_LABELS: Record<GuardrailScope, string> = {
  platform: "Platform",
  organization: "Organization",
  environment: "Environment",
  agent: "Agent",
  integration: "Integration",
  capability: "Capability",
  tool: "Tool / Action",
};

export type GuardrailType =
  | "block"
  | "require_approval"
  | "require_human_confirmation"
  | "require_escalation"
  | "limit_records"
  | "limit_scope"
  | "require_confidence"
  | "require_fresh_data"
  | "deny_sensitive_data"
  | "deny_production_action"
  | "require_change_ticket"
  | "require_rollback_plan"
  | "require_audit"
  | "rate_limit"
  | "allowlist"
  | "denylist";

export const GUARDRAIL_TYPES: GuardrailType[] = [
  "block",
  "require_approval",
  "require_human_confirmation",
  "require_escalation",
  "limit_records",
  "limit_scope",
  "require_confidence",
  "require_fresh_data",
  "deny_sensitive_data",
  "deny_production_action",
  "require_change_ticket",
  "require_rollback_plan",
  "require_audit",
  "rate_limit",
  "allowlist",
  "denylist",
];

export const GUARDRAIL_TYPE_LABELS: Record<GuardrailType, string> = {
  block: "Block",
  require_approval: "Require approval",
  require_human_confirmation: "Require human confirmation",
  require_escalation: "Require escalation",
  limit_records: "Limit affected records",
  limit_scope: "Limit scope",
  require_confidence: "Require confidence",
  require_fresh_data: "Require fresh data",
  deny_sensitive_data: "Deny sensitive data",
  deny_production_action: "Deny production action",
  require_change_ticket: "Require change record",
  require_rollback_plan: "Require rollback plan",
  require_audit: "Require audit",
  rate_limit: "Rate limit",
  allowlist: "Allowlist",
  denylist: "Denylist",
};

export type GuardrailSeverity = "low" | "medium" | "high" | "critical";
export const GUARDRAIL_SEVERITIES: GuardrailSeverity[] = ["low", "medium", "high", "critical"];

/** enforce = decisions are binding. monitor = matched and recorded only. */
export type EnforcementMode = "enforce" | "monitor";
export const ENFORCEMENT_MODES: EnforcementMode[] = ["enforce", "monitor"];

export type GuardrailEffect =
  | "block"
  | "require_approval"
  | "require_confirmation"
  | "escalate"
  | "limit"
  | "require_change_ticket"
  | "allow";

export const GUARDRAIL_EFFECTS: GuardrailEffect[] = [
  "block",
  "require_approval",
  "require_confirmation",
  "escalate",
  "limit",
  "require_change_ticket",
  "allow",
];

export const EFFECT_LABELS: Record<GuardrailEffect, string> = {
  block: "Block",
  require_approval: "Require approval",
  require_confirmation: "Require human confirmation",
  escalate: "Escalate",
  limit: "Limit",
  require_change_ticket: "Require change record",
  allow: "Allow",
};

/** Standard execution classifications guardrails can reference. */
export type ExecutionClass =
  | "read_only"
  | "low_risk"
  | "moderate_risk"
  | "high_risk"
  | "destructive";

export const EXECUTION_CLASSES: ExecutionClass[] = [
  "read_only",
  "low_risk",
  "moderate_risk",
  "high_risk",
  "destructive",
];

export const EXECUTION_CLASS_LABELS: Record<ExecutionClass, string> = {
  read_only: "Read-only",
  low_risk: "Low risk",
  moderate_risk: "Moderate risk",
  high_risk: "High risk",
  destructive: "Destructive",
};

export function isWriteClass(cls: ExecutionClass): boolean {
  return cls !== "read_only";
}

export type Environment = "development" | "staging" | "production";
export const ENVIRONMENTS: Environment[] = ["development", "staging", "production"];

export type DataClassification =
  | "public"
  | "internal"
  | "confidential"
  | "restricted"
  | "secret";

export const DATA_CLASSIFICATIONS: DataClassification[] = [
  "public",
  "internal",
  "confidential",
  "restricted",
  "secret",
];

export type FreshnessValue = "fresh" | "aging" | "stale" | "unavailable";

/** Fields a guardrail condition may match on. Strictly allowlisted. */
export interface GuardrailConditions {
  environment?: Environment;
  environment_in?: Environment[];
  provider?: string;
  provider_in?: string[];
  agent_key?: string;
  agent_key_in?: string[];
  integration_id?: string;
  capability?: string;
  capability_in?: string[];
  action_key?: string;
  action_key_in?: string[];
  execution_class?: ExecutionClass;
  execution_class_in?: ExecutionClass[];
  is_destructive?: boolean;
  is_write?: boolean;
  affected_records_gt?: number;
  affected_records_gte?: number;
  confidence_lt?: number;
  freshness_in?: FreshnessValue[];
  data_classification?: DataClassification;
  data_classification_in?: DataClassification[];
  has_change_ticket?: boolean;
  has_approval?: boolean;
  has_rollback_plan?: boolean;
  role_in?: string[];
  /** allowlist/denylist matching. */
  match_field?: "action_key" | "capability" | "provider" | "agent_key";
  match_values?: string[];
}

export interface GuardrailAction {
  effect: GuardrailEffect;
  /** LIMIT_RECORDS / LIMIT_SCOPE cap. */
  max_records?: number;
  /** REQUIRE_ESCALATION target (team/role name). */
  escalate_to?: string;
  /** DENY_SENSITIVE_DATA field redaction on capability results. */
  redact_fields?: string[];
  /** RATE_LIMIT ceilings. */
  max_actions_per_hour?: number;
  message?: string;
}

export interface GuardrailRecord {
  id: string;
  tenantId: string | null;
  name: string;
  description: string | null;
  scope: GuardrailScope;
  scopeId: string | null;
  guardrailType: GuardrailType;
  enabled: boolean;
  priority: number;
  severity: GuardrailSeverity;
  enforcementMode: EnforcementMode;
  conditions: GuardrailConditions;
  action: GuardrailAction;
  message: string | null;
  isSystem: boolean;
  version: number;
  createdAt?: string;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Validation. Anything reaching the database passes through here server-side,
// so a browser (or an LLM-generated draft) can never store an unknown field,
// an executable expression, or an out-of-range value.
// ---------------------------------------------------------------------------

export interface GuardrailIssue {
  field: string;
  message: string;
}

export type GuardrailParseResult =
  | { ok: true; conditions: GuardrailConditions; action: GuardrailAction }
  | { ok: false; issues: GuardrailIssue[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const CONDITION_FIELDS: Record<keyof GuardrailConditions, "string" | "boolean" | "number" | "list"> =
  {
    environment: "string",
    environment_in: "list",
    provider: "string",
    provider_in: "list",
    agent_key: "string",
    agent_key_in: "list",
    integration_id: "string",
    capability: "string",
    capability_in: "list",
    action_key: "string",
    action_key_in: "list",
    execution_class: "string",
    execution_class_in: "list",
    is_destructive: "boolean",
    is_write: "boolean",
    affected_records_gt: "number",
    affected_records_gte: "number",
    confidence_lt: "number",
    freshness_in: "list",
    data_classification: "string",
    data_classification_in: "list",
    has_change_ticket: "boolean",
    has_approval: "boolean",
    has_rollback_plan: "boolean",
    role_in: "list",
    match_field: "string",
    match_values: "list",
  };

const ENUM_FIELDS: Partial<Record<keyof GuardrailConditions, readonly string[]>> = {
  environment: ENVIRONMENTS,
  environment_in: ENVIRONMENTS,
  execution_class: EXECUTION_CLASSES,
  execution_class_in: EXECUTION_CLASSES,
  data_classification: DATA_CLASSIFICATIONS,
  data_classification_in: DATA_CLASSIFICATIONS,
  freshness_in: ["fresh", "aging", "stale", "unavailable"],
  match_field: ["action_key", "capability", "provider", "agent_key"],
};

const MAX_LIST = 200;

/** Validates untrusted guardrail conditions + action into typed structures. */
export function parseGuardrailConfig(
  rawConditions: unknown,
  rawAction: unknown,
): GuardrailParseResult {
  const issues: GuardrailIssue[] = [];
  const conditions: Record<string, unknown> = {};

  if (rawConditions !== undefined && rawConditions !== null) {
    if (!isRecord(rawConditions)) {
      issues.push({ field: "conditions", message: "Conditions must be an object." });
    } else {
      for (const [key, value] of Object.entries(rawConditions)) {
        const kind = CONDITION_FIELDS[key as keyof GuardrailConditions];
        if (!kind) {
          issues.push({ field: `conditions.${key}`, message: `"${key}" is not a supported condition.` });
          continue;
        }
        if (value === undefined || value === null || value === "") continue;
        const allowed = ENUM_FIELDS[key as keyof GuardrailConditions];

        if (kind === "boolean") {
          if (typeof value !== "boolean") {
            issues.push({ field: `conditions.${key}`, message: `${key} must be true or false.` });
            continue;
          }
          conditions[key] = value;
        } else if (kind === "number") {
          const n = typeof value === "number" ? value : Number(value);
          if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
            issues.push({ field: `conditions.${key}`, message: `${key} must be a number between 0 and 1,000,000.` });
            continue;
          }
          conditions[key] = n;
        } else if (kind === "string") {
          if (typeof value !== "string" || !value.trim()) {
            issues.push({ field: `conditions.${key}`, message: `${key} must be text.` });
            continue;
          }
          const v = value.trim().slice(0, 160);
          if (allowed && !allowed.includes(v)) {
            issues.push({ field: `conditions.${key}`, message: `${key} must be one of ${allowed.join(", ")}.` });
            continue;
          }
          conditions[key] = v;
        } else {
          if (!Array.isArray(value) || value.length > MAX_LIST) {
            issues.push({ field: `conditions.${key}`, message: `${key} must be a list of at most ${MAX_LIST} values.` });
            continue;
          }
          const list: string[] = [];
          let bad = false;
          for (const item of value) {
            if (typeof item !== "string" || !item.trim()) {
              bad = true;
              break;
            }
            const v = item.trim().slice(0, 160);
            if (allowed && !allowed.includes(v)) {
              bad = true;
              break;
            }
            list.push(v);
          }
          if (bad) {
            issues.push({
              field: `conditions.${key}`,
              message: allowed
                ? `${key} may only contain ${allowed.join(", ")}.`
                : `${key} may only contain non-empty text values.`,
            });
            continue;
          }
          if (list.length) conditions[key] = list;
        }
      }
    }
  }

  if (!Object.keys(conditions).length) {
    issues.push({
      field: "conditions",
      message: "A guardrail must define at least one condition — an unconditional rule is not accepted.",
    });
  }

  const action: GuardrailAction = { effect: "block" };
  if (!isRecord(rawAction)) {
    issues.push({ field: "action", message: "Action must be an object." });
  } else {
    const allowedActionKeys = new Set([
      "effect",
      "max_records",
      "escalate_to",
      "redact_fields",
      "max_actions_per_hour",
      "message",
    ]);
    for (const key of Object.keys(rawAction)) {
      if (!allowedActionKeys.has(key)) {
        issues.push({ field: `action.${key}`, message: `"${key}" is not a supported action field.` });
      }
    }
    const effect = rawAction["effect"];
    if (typeof effect !== "string" || !GUARDRAIL_EFFECTS.includes(effect as GuardrailEffect)) {
      issues.push({ field: "action.effect", message: `Effect must be one of ${GUARDRAIL_EFFECTS.join(", ")}.` });
    } else {
      action.effect = effect as GuardrailEffect;
    }
    for (const numeric of ["max_records", "max_actions_per_hour"] as const) {
      const raw = rawAction[numeric];
      if (raw === undefined || raw === null || raw === "") continue;
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 1_000_000) {
        issues.push({ field: `action.${numeric}`, message: `${numeric} must be a whole number.` });
        continue;
      }
      action[numeric] = n;
    }
    const escalate = rawAction["escalate_to"];
    if (typeof escalate === "string" && escalate.trim()) action.escalate_to = escalate.trim().slice(0, 120);
    const message = rawAction["message"];
    if (typeof message === "string" && message.trim()) action.message = message.trim().slice(0, 400);
    const redact = rawAction["redact_fields"];
    if (redact !== undefined && redact !== null) {
      if (!Array.isArray(redact) || redact.some((f) => typeof f !== "string")) {
        issues.push({ field: "action.redact_fields", message: "redact_fields must be a list of field names." });
      } else {
        action.redact_fields = (redact as string[]).slice(0, 50).map((f) => f.trim().slice(0, 80));
      }
    }
  }

  if (issues.length) return { ok: false, issues };
  return { ok: true, conditions: conditions as GuardrailConditions, action };
}

/** Never throws — used on read paths for rows that may predate a schema change. */
export function coerceStoredGuardrail(conditions: unknown, action: unknown): {
  conditions: GuardrailConditions;
  action: GuardrailAction;
} {
  const parsed = parseGuardrailConfig(conditions, action);
  if (parsed.ok) return { conditions: parsed.conditions, action: parsed.action };
  // A row we cannot interpret must never silently widen access: keep only the
  // fields that do validate and fall back to the most restrictive effect.
  const safeConditions: Record<string, unknown> = {};
  if (isRecord(conditions)) {
    for (const [key, value] of Object.entries(conditions)) {
      const single = parseGuardrailConfig({ [key]: value }, { effect: "block" });
      if (single.ok) Object.assign(safeConditions, single.conditions);
    }
  }
  const effect =
    isRecord(action) && typeof action["effect"] === "string" &&
    GUARDRAIL_EFFECTS.includes(action["effect"] as GuardrailEffect)
      ? (action["effect"] as GuardrailEffect)
      : "block";
  return { conditions: safeConditions as GuardrailConditions, action: { effect } };
}

// ---------------------------------------------------------------------------
// Human-readable rendering (Review step in the builder, approval records, audit)
// ---------------------------------------------------------------------------

const CONDITION_PHRASES: Partial<Record<keyof GuardrailConditions, (v: unknown) => string>> = {
  environment: (v) => `the environment is ${String(v)}`,
  environment_in: (v) => `the environment is one of ${(v as string[]).join(", ")}`,
  provider: (v) => `the connector is ${String(v)}`,
  provider_in: (v) => `the connector is one of ${(v as string[]).join(", ")}`,
  agent_key: (v) => `the agent is ${String(v)}`,
  agent_key_in: (v) => `the agent is one of ${(v as string[]).join(", ")}`,
  integration_id: () => `the integration matches`,
  capability: (v) => `the capability is ${String(v)}`,
  capability_in: (v) => `the capability is one of ${(v as string[]).join(", ")}`,
  action_key: (v) => `the action is ${String(v)}`,
  action_key_in: (v) => `the action is one of ${(v as string[]).join(", ")}`,
  execution_class: (v) => `the action is classified ${String(v).replace(/_/g, " ")}`,
  execution_class_in: (v) =>
    `the action is classified ${(v as string[]).map((c) => c.replace(/_/g, " ")).join(" or ")}`,
  is_destructive: (v) => (v ? "the action is destructive" : "the action is not destructive"),
  is_write: (v) => (v ? "the action writes data" : "the action is read-only"),
  affected_records_gt: (v) => `more than ${String(v)} records are affected`,
  affected_records_gte: (v) => `at least ${String(v)} records are affected`,
  confidence_lt: (v) => `confidence is below ${String(v)}%`,
  freshness_in: (v) => `the data is ${(v as string[]).join(" or ")}`,
  data_classification: (v) => `the data is classified ${String(v)}`,
  data_classification_in: (v) => `the data is classified ${(v as string[]).join(" or ")}`,
  has_change_ticket: (v) => (v ? "a change record exists" : "no change record exists"),
  has_approval: (v) => (v ? "an approval exists" : "no approval exists"),
  has_rollback_plan: (v) => (v ? "a rollback plan exists" : "no rollback plan exists"),
  role_in: (v) => `the requester's role is one of ${(v as string[]).join(", ")}`,
  match_values: (v) => `the value is one of ${(v as string[]).join(", ")}`,
};

const EFFECT_PHRASES: Record<GuardrailEffect, string> = {
  block: "block the operation",
  require_approval: "require an approved change before execution",
  require_confirmation: "require explicit human confirmation",
  escalate: "escalate for review",
  limit: "limit the operation",
  require_change_ticket: "require a change record before execution",
  allow: "allow the operation",
};

export function describeGuardrail(g: {
  scope: GuardrailScope;
  scopeId?: string | null;
  conditions: GuardrailConditions;
  action: GuardrailAction;
}): string {
  const parts = Object.entries(g.conditions)
    .filter(([key]) => key !== "match_field")
    .map(([key, value]) => {
      const phrase = CONDITION_PHRASES[key as keyof GuardrailConditions];
      return phrase ? phrase(value) : `${key} matches`;
    });
  const when = parts.length ? parts.join(" and ") : "any operation runs";
  const where =
    g.scope === "platform"
      ? "anywhere on the platform"
      : `${SCOPE_LABELS[g.scope].toLowerCase()} scope${g.scopeId ? ` "${g.scopeId}"` : ""}`;
  const limit =
    g.action.effect === "limit" && g.action.max_records
      ? ` to at most ${g.action.max_records} records`
      : "";
  return `When ${when} in ${where}, ${EFFECT_PHRASES[g.action.effect]}${limit}.`;
}
