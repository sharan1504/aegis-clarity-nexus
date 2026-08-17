// GUARDRAILS — server-side enforcement engine.
//
// This module is the ONLY authority on whether a governed operation may run.
// It is called by the capability router, the tool/MCP layer and any future
// workflow executor. Guardrails are never expressed as prompt text, so no
// agent, LLM, user instruction, connector or tool call can negotiate with them.
//
// Fail-closed: if guardrails cannot be loaded or evaluated, the operation is
// denied.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";
import {
  evaluateGuardrailSet,
  GuardrailViolation,
  unavailableVerdict,
  type GuardrailContext,
  type GuardrailVerdict,
} from "./evaluate";
import {
  coerceStoredGuardrail,
  type EnforcementMode,
  type GuardrailRecord,
  type GuardrailScope,
  type GuardrailSeverity,
  type GuardrailType,
} from "./types";

type UserClient = SupabaseClient<Database>;

const GUARDRAIL_COLUMNS =
  "id, tenant_id, name, description, scope, scope_id, guardrail_type, enabled, priority, severity, enforcement_mode, conditions, action, message, is_system, version, created_at, updated_at";

type GuardrailRow = {
  id: string;
  tenant_id: string | null;
  name: string;
  description: string | null;
  scope: string;
  scope_id: string | null;
  guardrail_type: string;
  enabled: boolean;
  priority: number;
  severity: string;
  enforcement_mode: string;
  conditions: unknown;
  action: unknown;
  message: string | null;
  is_system: boolean;
  version: number;
  created_at?: string;
  updated_at?: string;
};

export function mapGuardrailRow(row: GuardrailRow): GuardrailRecord {
  const { conditions, action } = coerceStoredGuardrail(row.conditions, row.action);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    scope: row.scope as GuardrailScope,
    scopeId: row.scope_id,
    guardrailType: row.guardrail_type as GuardrailType,
    enabled: row.enabled,
    priority: Number(row.priority ?? 100),
    severity: row.severity as GuardrailSeverity,
    enforcementMode: row.enforcement_mode as EnforcementMode,
    conditions,
    action,
    message: row.message,
    isSystem: row.is_system,
    version: Number(row.version ?? 1),
    ...(row.created_at ? { createdAt: row.created_at } : {}),
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  };
}

/**
 * Loads the guardrails in force for a tenant: the platform baseline
 * (tenant_id IS NULL) plus the tenant's own rules. Throws on failure so callers
 * fail closed instead of running with an empty rule set.
 */
export async function loadGuardrails(
  supabase: UserClient,
  tenantId: string,
): Promise<GuardrailRecord[]> {
  const { data, error } = await supabase
    .from("guardrails")
    .select(GUARDRAIL_COLUMNS)
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`);

  if (error) throw new Error(`guardrails_unavailable: ${error.message}`);
  return (data ?? []).map((row) => mapGuardrailRow(row as unknown as GuardrailRow));
}

export interface EnforcementRecordInput {
  origin?: string;
  userId?: string | null;
  changeRecordId?: string | null;
  simulated?: boolean;
}

/**
 * Records the decision for observability. Never allowed to change the outcome:
 * a logging failure is swallowed after being reported to the server log.
 */
export async function recordGuardrailEvaluation(
  supabase: UserClient,
  ctx: GuardrailContext,
  verdict: GuardrailVerdict,
  meta: EnforcementRecordInput = {},
): Promise<void> {
  try {
    await supabase.from("guardrail_evaluations").insert({
      tenant_id: ctx.tenantId,
      user_id: meta.userId ?? null,
      agent_key: ctx.agentKey ?? null,
      integration_id: ctx.integrationId ?? null,
      provider: ctx.provider ?? null,
      capability: ctx.capability ?? null,
      action_key: ctx.actionKey ?? null,
      environment: ctx.environment ?? "production",
      execution_class: ctx.executionClass,
      decision: verdict.decision,
      simulated: Boolean(meta.simulated),
      matched: verdict.matched as unknown as Json,
      reasons: verdict.reasons as unknown as Json,
      required_actions: verdict.requiredActions as unknown as Json,
      context: {
        origin: meta.origin ?? "agent",
        affectedRecords: ctx.affectedRecords ?? null,
        confidence: ctx.confidence ?? null,
        freshness: ctx.freshness ?? null,
        dataClassification: ctx.dataClassification ?? null,
        hasChangeTicket: Boolean(ctx.hasChangeTicket),
        hasApproval: Boolean(ctx.hasApproval),
        hasRollbackPlan: Boolean(ctx.hasRollbackPlan),
        actorRole: ctx.actorRole ?? null,
      } as unknown as Json,
      change_record_id: meta.changeRecordId ?? null,
    });
  } catch (error) {
    console.error("[guardrails] evaluation log failed", (error as Error).message);
  }
}

/**
 * Evaluates guardrails for one operation and records the decision.
 * Any load/evaluation error produces an `unavailable` (denied) verdict.
 */
export async function evaluateGuardrails(
  supabase: UserClient,
  ctx: GuardrailContext,
  meta: EnforcementRecordInput = {},
): Promise<GuardrailVerdict> {
  let verdict: GuardrailVerdict;
  try {
    const rules = await loadGuardrails(supabase, ctx.tenantId);
    verdict = evaluateGuardrailSet(rules, ctx);
  } catch (error) {
    console.error("[guardrails] evaluation failed", (error as Error).message);
    verdict = unavailableVerdict(
      "Guardrails could not be evaluated, so the operation was denied.",
    );
  }
  await recordGuardrailEvaluation(supabase, ctx, verdict, meta);
  return verdict;
}

/**
 * Hard gate. Throws GuardrailViolation unless the operation is fully allowed.
 * Use for write/destructive paths; read paths use `evaluateGuardrails` and
 * degrade instead of throwing.
 */
export async function enforceGuardrails(
  supabase: UserClient,
  ctx: GuardrailContext,
  meta: EnforcementRecordInput = {},
): Promise<GuardrailVerdict> {
  const verdict = await evaluateGuardrails(supabase, ctx, meta);
  if (!verdict.allowed) throw new GuardrailViolation(verdict);
  return verdict;
}

/** Simulation — identical evaluation, recorded as simulated, never enforced. */
export async function simulateGuardrails(
  supabase: UserClient,
  ctx: GuardrailContext,
  meta: EnforcementRecordInput = {},
): Promise<GuardrailVerdict> {
  return evaluateGuardrails(supabase, ctx, { ...meta, simulated: true });
}
