// GUARDRAILS — deterministic evaluation core.
//
// Pure functions only: no I/O, no credentials, no provider knowledge. The same
// code path serves real enforcement (engine.server.ts) and the simulator, so a
// simulated verdict is always identical to the enforced one.
//
// Guardrails are evaluated by precedence: Platform > Organization >
// Environment > Agent > Integration > Capability > Tool, then by priority
// (lower number first). The most restrictive matched effect wins; a lower
// scope can never weaken a higher-scope restriction.

import {
  coerceStoredGuardrail,
  isWriteClass,
  scopeRank,
  type DataClassification,
  type Environment,
  type ExecutionClass,
  type FreshnessValue,
  type GuardrailAction,
  type GuardrailConditions,
  type GuardrailEffect,
  type GuardrailRecord,
  type GuardrailScope,
  type GuardrailSeverity,
} from "./types";

export interface GuardrailContext {
  tenantId: string;
  /** Who/what is attempting the operation. */
  actorRole?: string | null;
  agentKey?: string | null;
  /** 'agent' | 'user' | 'tool' | 'workflow' | 'mcp' — recorded, not matched. */
  origin?: string;
  provider?: string | null;
  integrationId?: string | null;
  capability?: string | null;
  /** Tool / action identifier for non-capability operations. */
  actionKey?: string | null;
  environment?: Environment;
  executionClass: ExecutionClass;
  affectedRecords?: number | null;
  confidence?: number | null;
  freshness?: FreshnessValue | null;
  dataClassification?: DataClassification | null;
  hasChangeTicket?: boolean;
  hasApproval?: boolean;
  hasRollbackPlan?: boolean;
}

export type GuardrailDecision =
  | "allow"
  | "block"
  | "require_approval"
  | "require_confirmation"
  | "escalate"
  | "unavailable";

/** Most restrictive first. Conflicts resolve to the lowest index. */
const DECISION_RANK: GuardrailDecision[] = [
  "unavailable",
  "block",
  "require_approval",
  "escalate",
  "require_confirmation",
  "allow",
];

const EFFECT_TO_DECISION: Record<GuardrailEffect, GuardrailDecision> = {
  block: "block",
  require_approval: "require_approval",
  require_change_ticket: "require_approval",
  escalate: "escalate",
  require_confirmation: "require_confirmation",
  limit: "allow",
  allow: "allow",
};

export interface MatchedGuardrail {
  id: string;
  name: string;
  scope: GuardrailScope;
  scopeId: string | null;
  guardrailType: string;
  severity: GuardrailSeverity;
  version: number;
  isSystem: boolean;
  enforced: boolean;
  effect: GuardrailEffect;
  message: string;
}

export interface GuardrailVerdict {
  decision: GuardrailDecision;
  allowed: boolean;
  /** Matched guardrails in evaluation order (enforced + monitor-only). */
  matched: MatchedGuardrail[];
  reasons: string[];
  /** Human-facing required next steps, e.g. "Obtain an approved change record". */
  requiredActions: string[];
  /** Hard cap on records the operation may touch, if any guardrail limits it. */
  maxRecords: number | null;
  /** Fields that must be removed from any output. */
  redactFields: string[];
  /** Team/role the operation must be escalated to. */
  escalateTo: string | null;
  /** True when the operation may proceed but requires a human step first. */
  requiresHuman: boolean;
  evaluatedAt: string;
}

function moreRestrictive(a: GuardrailDecision, b: GuardrailDecision): GuardrailDecision {
  return DECISION_RANK.indexOf(a) <= DECISION_RANK.indexOf(b) ? a : b;
}

const REQUIRED_ACTION_BY_EFFECT: Partial<Record<GuardrailEffect, string>> = {
  require_approval: "Obtain an approved change record before execution.",
  require_change_ticket: "Attach a change record to this operation.",
  require_confirmation: "A human must explicitly confirm this operation.",
  escalate: "Escalate this operation for review.",
};

/** Does the guardrail's scope apply to this context at all? */
export function scopeApplies(
  scope: GuardrailScope,
  scopeId: string | null,
  ctx: GuardrailContext,
): boolean {
  switch (scope) {
    case "platform":
    case "organization":
      return true;
    case "environment":
      return !scopeId || scopeId === (ctx.environment ?? "production");
    case "agent":
      return !scopeId || scopeId === ctx.agentKey;
    case "integration":
      return !scopeId || scopeId === ctx.integrationId || scopeId === ctx.provider;
    case "capability":
      return !scopeId || scopeId === ctx.capability;
    case "tool":
      return !scopeId || scopeId === ctx.actionKey;
    default:
      return false;
  }
}

/** Every declared condition must match (AND). Unknown fields never match. */
export function conditionsMatch(conditions: GuardrailConditions, ctx: GuardrailContext): boolean {
  const env = ctx.environment ?? "production";
  const isWrite = isWriteClass(ctx.executionClass);
  const isDestructive = ctx.executionClass === "destructive";

  const eq = (expected: unknown, actual: unknown) =>
    expected === undefined || expected === actual;
  const oneOf = (list: string[] | undefined, actual: string | null | undefined) =>
    list === undefined || (typeof actual === "string" && list.includes(actual));

  if (!eq(conditions.environment, env)) return false;
  if (!oneOf(conditions.environment_in, env)) return false;
  if (!eq(conditions.provider, ctx.provider ?? undefined)) return false;
  if (!oneOf(conditions.provider_in, ctx.provider)) return false;
  if (!eq(conditions.agent_key, ctx.agentKey ?? undefined)) return false;
  if (!oneOf(conditions.agent_key_in, ctx.agentKey)) return false;
  if (!eq(conditions.integration_id, ctx.integrationId ?? undefined)) return false;
  if (!eq(conditions.capability, ctx.capability ?? undefined)) return false;
  if (!oneOf(conditions.capability_in, ctx.capability)) return false;
  if (!eq(conditions.action_key, ctx.actionKey ?? undefined)) return false;
  if (!oneOf(conditions.action_key_in, ctx.actionKey)) return false;
  if (!eq(conditions.execution_class, ctx.executionClass)) return false;
  if (!oneOf(conditions.execution_class_in, ctx.executionClass)) return false;
  if (conditions.is_write !== undefined && conditions.is_write !== isWrite) return false;
  if (conditions.is_destructive !== undefined && conditions.is_destructive !== isDestructive) {
    return false;
  }
  if (conditions.affected_records_gt !== undefined) {
    if (ctx.affectedRecords == null || ctx.affectedRecords <= conditions.affected_records_gt) {
      return false;
    }
  }
  if (conditions.affected_records_gte !== undefined) {
    if (ctx.affectedRecords == null || ctx.affectedRecords < conditions.affected_records_gte) {
      return false;
    }
  }
  if (conditions.confidence_lt !== undefined) {
    // Missing confidence is treated as failing the bar — fail closed.
    if (ctx.confidence == null || ctx.confidence >= conditions.confidence_lt) return false;
  }
  if (conditions.freshness_in !== undefined) {
    if (!ctx.freshness || !conditions.freshness_in.includes(ctx.freshness)) return false;
  }
  if (!eq(conditions.data_classification, ctx.dataClassification ?? undefined)) return false;
  if (!oneOf(conditions.data_classification_in, ctx.dataClassification)) return false;
  if (
    conditions.has_change_ticket !== undefined &&
    conditions.has_change_ticket !== Boolean(ctx.hasChangeTicket)
  ) {
    return false;
  }
  if (conditions.has_approval !== undefined && conditions.has_approval !== Boolean(ctx.hasApproval)) {
    return false;
  }
  if (
    conditions.has_rollback_plan !== undefined &&
    conditions.has_rollback_plan !== Boolean(ctx.hasRollbackPlan)
  ) {
    return false;
  }
  if (conditions.role_in !== undefined) {
    if (!ctx.actorRole || !conditions.role_in.includes(ctx.actorRole)) return false;
  }
  if (conditions.match_values !== undefined) {
    const field = conditions.match_field ?? "action_key";
    const actual =
      field === "action_key"
        ? ctx.actionKey
        : field === "capability"
          ? ctx.capability
          : field === "provider"
            ? ctx.provider
            : ctx.agentKey;
    if (!actual || !conditions.match_values.includes(actual)) return false;
  }
  return true;
}

/** Deterministic order: scope precedence, then priority, then name. */
export function sortGuardrails(rules: GuardrailRecord[]): GuardrailRecord[] {
  return [...rules].sort((a, b) => {
    // Platform-owned rows always precede tenant rows at the same scope.
    const systemDelta = Number(b.isSystem) - Number(a.isSystem);
    const scopeDelta = scopeRank(a.scope) - scopeRank(b.scope);
    if (scopeDelta !== 0) return scopeDelta;
    if (systemDelta !== 0) return systemDelta;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Evaluates guardrails against an operation context.
 *
 * A guardrail in `monitor` mode is recorded as matched but never changes the
 * decision. An `allow` effect is an explicit exception and can only be honoured
 * when no restrictive guardrail of equal or higher scope has matched.
 */
export function evaluateGuardrailSet(
  rules: GuardrailRecord[],
  ctx: GuardrailContext,
): GuardrailVerdict {
  const matched: MatchedGuardrail[] = [];
  const reasons: string[] = [];
  const requiredActions = new Set<string>();
  const redactFields = new Set<string>();
  let decision: GuardrailDecision = "allow";
  let maxRecords: number | null = null;
  let escalateTo: string | null = null;
  let restrictedAtRank = Number.POSITIVE_INFINITY;

  for (const rule of sortGuardrails(rules)) {
    if (!rule.enabled) continue;
    if (!scopeApplies(rule.scope, rule.scopeId, ctx)) continue;

    const { conditions, action } = normalizeRule(rule);
    if (!conditionsMatch(conditions, ctx)) continue;

    const enforced = rule.enforcementMode === "enforce";
    const message =
      rule.message ?? action.message ?? `Guardrail "${rule.name}" applies to this operation.`;

    matched.push({
      id: rule.id,
      name: rule.name,
      scope: rule.scope,
      scopeId: rule.scopeId,
      guardrailType: rule.guardrailType,
      severity: rule.severity,
      version: rule.version,
      isSystem: rule.isSystem,
      enforced,
      effect: action.effect,
      message,
    });

    if (!enforced) continue;

    if (action.effect === "allow") {
      // An exception may not override a restriction already applied by an
      // equal or higher scope.
      if (scopeRank(rule.scope) <= restrictedAtRank) continue;
      continue;
    }

    reasons.push(message);
    const required = REQUIRED_ACTION_BY_EFFECT[action.effect];
    if (required) requiredActions.add(required);
    for (const field of action.redact_fields ?? []) redactFields.add(field);
    if (action.escalate_to && !escalateTo) escalateTo = action.escalate_to;

    if (action.effect === "limit" || action.max_records != null) {
      if (action.max_records != null) {
        maxRecords = maxRecords == null ? action.max_records : Math.min(maxRecords, action.max_records);
      }
      if (
        action.effect === "limit" &&
        action.max_records != null &&
        (ctx.affectedRecords ?? 0) > action.max_records
      ) {
        decision = moreRestrictive(decision, "require_approval");
        requiredActions.add(
          `Reduce the operation to ${action.max_records} records or obtain an approved change.`,
        );
      }
    }

    const next = EFFECT_TO_DECISION[action.effect];
    const before = decision;
    decision = moreRestrictive(decision, next);
    if (decision !== "allow" && decision !== before) restrictedAtRank = scopeRank(rule.scope);
    if (decision !== "allow") restrictedAtRank = Math.min(restrictedAtRank, scopeRank(rule.scope));
  }

  return {
    decision,
    allowed: decision === "allow",
    matched,
    reasons,
    requiredActions: [...requiredActions],
    maxRecords,
    redactFields: [...redactFields],
    escalateTo,
    requiresHuman:
      decision === "require_approval" ||
      decision === "require_confirmation" ||
      decision === "escalate",
    evaluatedAt: new Date().toISOString(),
  };
}

function normalizeRule(rule: GuardrailRecord): {
  conditions: GuardrailConditions;
  action: GuardrailAction;
} {
  return coerceStoredGuardrail(rule.conditions, rule.action);
}

/**
 * Fail-closed verdict. Used whenever guardrails cannot be loaded or evaluated:
 * the operation is denied rather than allowed.
 */
export function unavailableVerdict(reason: string): GuardrailVerdict {
  return {
    decision: "unavailable",
    allowed: false,
    matched: [],
    reasons: [reason],
    requiredActions: ["Resolve the governance service error and retry."],
    maxRecords: 0,
    redactFields: [],
    escalateTo: null,
    requiresHuman: false,
    evaluatedAt: new Date().toISOString(),
  };
}

export class GuardrailViolation extends Error {
  readonly verdict: GuardrailVerdict;
  constructor(verdict: GuardrailVerdict) {
    super(
      verdict.reasons[0] ??
        (verdict.decision === "unavailable"
          ? "Guardrails could not be evaluated; the operation was denied."
          : "This operation is blocked by a guardrail."),
    );
    this.name = "GuardrailViolation";
    this.verdict = verdict;
  }
}
