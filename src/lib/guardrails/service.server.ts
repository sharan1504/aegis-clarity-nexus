// GUARDRAILS — governance management (server-only).
//
// Guardrail authoring is an administrative act: every write re-checks the
// caller's role server-side, forces the tenant from the verified session, and
// re-validates the declarative rule. Platform guardrails (tenant_id IS NULL,
// is_system) are read-only for every tenant, at the RLS level as well as here.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";
import { mapGuardrailRow } from "./engine.server";
import {
  coerceStoredGuardrail,
  ENFORCEMENT_MODES,
  GUARDRAIL_SEVERITIES,
  GUARDRAIL_TYPES,
  SCOPE_PRECEDENCE,
  parseGuardrailConfig,
  type EnforcementMode,
  type GuardrailAction,
  type GuardrailConditions,
  type GuardrailIssue,
  type GuardrailRecord,
  type GuardrailScope,
  type GuardrailSeverity,
  type GuardrailType,
} from "./types";

type UserClient = SupabaseClient<Database>;

export class GuardrailError extends Error {
  code: string;
  issues: GuardrailIssue[];
  constructor(code: string, message: string, issues: GuardrailIssue[] = []) {
    super(message);
    this.code = code;
    this.issues = issues;
    this.name = "GuardrailError";
  }
}

export const GUARDRAIL_ERRORS: Record<string, string> = {
  no_tenant: "Your account is not attached to a workspace yet.",
  forbidden: "Only workspace admins can change guardrails.",
  system_guardrail: "Platform guardrails are mandatory and cannot be changed or removed.",
  not_found: "That guardrail does not exist in this workspace.",
  invalid_guardrail: "That guardrail contains values the platform will not accept.",
  denied_by_policy:
    "The database refused this change. Your account may not have admin rights in this workspace.",
  save_failed: "The guardrail could not be saved. Please try again.",
};

/**
 * Turns a database error into an actionable message. A generic "please try
 * again" hides the two failures that actually happen in practice — a permission
 * refusal and a constraint violation — so those are named explicitly.
 */
function saveError(
  operation: string,
  error: { code?: string; message?: string; details?: string; hint?: string } | null,
): GuardrailError {
  console.error(`[guardrails] ${operation} failed`, {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
  });
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  if (code === "42501" || code === "PGRST301" || /permission denied|row-level security/i.test(message)) {
    return new GuardrailError("denied_by_policy", GUARDRAIL_ERRORS["denied_by_policy"]!);
  }
  if (code.startsWith("23")) {
    return new GuardrailError("invalid_guardrail", GUARDRAIL_ERRORS["invalid_guardrail"]!, [
      { field: "conditions", message: "The database rejected these values as invalid." },
    ]);
  }
  return new GuardrailError("save_failed", GUARDRAIL_ERRORS["save_failed"]!);
}

export function guardrailErrorPayload(error: unknown) {
  const code = error instanceof GuardrailError ? error.code : "save_failed";
  const issues = error instanceof GuardrailError ? error.issues : [];
  return {
    ok: false as const,
    errorCode: code,
    errorMessage: (issues[0]?.message ??
      GUARDRAIL_ERRORS[code] ??
      GUARDRAIL_ERRORS["save_failed"]) as string,
    issues,
  };
}

export interface GovernanceContext {
  tenantId: string;
  roles: string[];
  canManage: boolean;
}

export async function resolveGovernanceContext(
  supabase: UserClient,
  userId: string,
): Promise<GovernanceContext> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  const tenantId = profile?.tenant_id;
  if (!tenantId) throw new GuardrailError("no_tenant", GUARDRAIL_ERRORS["no_tenant"]!);

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);
  const roles = (roleRows ?? []).map((r) => String(r.role));
  // Guardrails govern every other control, so only admins may author them.
  return { tenantId, roles, canManage: roles.includes("admin") };
}

export async function requireGuardrailAdmin(supabase: UserClient, userId: string) {
  const ctx = await resolveGovernanceContext(supabase, userId);
  if (!ctx.canManage) throw new GuardrailError("forbidden", GUARDRAIL_ERRORS["forbidden"]!);
  return ctx;
}

const GUARDRAIL_COLUMNS =
  "id, tenant_id, name, description, scope, scope_id, guardrail_type, enabled, priority, severity, enforcement_mode, conditions, action, message, is_system, version, created_at, updated_at";

export async function listGuardrails(
  supabase: UserClient,
  tenantId: string,
): Promise<GuardrailRecord[]> {
  const { data, error } = await supabase
    .from("guardrails")
    .select(GUARDRAIL_COLUMNS)
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .order("priority", { ascending: true });
  if (error) throw saveError("list", error);
  return (data ?? []).map((row) => mapGuardrailRow(row as never));
}

export interface GuardrailInput {
  id?: string | null;
  name: string;
  description?: string | null;
  scope: string;
  scopeId?: string | null;
  guardrailType: string;
  enabled?: boolean;
  priority?: number;
  severity?: string;
  enforcementMode?: string;
  conditions: unknown;
  action: unknown;
  message?: string | null;
}

function validate(input: GuardrailInput) {
  const issues: GuardrailIssue[] = [];
  const name = String(input.name ?? "").trim();
  if (name.length < 3) issues.push({ field: "name", message: "Give the guardrail a clear name." });

  const scope = String(input.scope ?? "");
  if (!SCOPE_PRECEDENCE.includes(scope as GuardrailScope)) {
    issues.push({ field: "scope", message: "Choose a valid scope." });
  }
  if (scope === "platform") {
    issues.push({
      field: "scope",
      message: "Platform guardrails are managed by Aegis and cannot be authored here.",
    });
  }

  const guardrailType = String(input.guardrailType ?? "");
  if (!GUARDRAIL_TYPES.includes(guardrailType as GuardrailType)) {
    issues.push({ field: "guardrailType", message: "Choose a valid guardrail type." });
  }

  const severity = String(input.severity ?? "high");
  if (!GUARDRAIL_SEVERITIES.includes(severity as GuardrailSeverity)) {
    issues.push({ field: "severity", message: "Choose a valid severity." });
  }

  const enforcementMode = String(input.enforcementMode ?? "enforce");
  if (!ENFORCEMENT_MODES.includes(enforcementMode as EnforcementMode)) {
    issues.push({ field: "enforcementMode", message: "Choose enforce or monitor." });
  }

  const priority = Number(input.priority ?? 100);
  if (!Number.isInteger(priority) || priority < 1 || priority > 1000) {
    issues.push({ field: "priority", message: "Priority must be between 1 and 1000." });
  }

  const parsed = parseGuardrailConfig(input.conditions, input.action);
  if (!parsed.ok) issues.push(...parsed.issues);

  const scopeId = input.scopeId ? String(input.scopeId).trim().slice(0, 160) : null;
  if (scope !== "organization" && scope !== "platform" && !scopeId) {
    issues.push({ field: "scopeId", message: "Select what this guardrail applies to." });
  }

  if (issues.length || !parsed.ok) {
    throw new GuardrailError("invalid_guardrail", GUARDRAIL_ERRORS["invalid_guardrail"]!, issues);
  }

  return {
    name: name.slice(0, 160),
    description: input.description ? String(input.description).trim().slice(0, 600) : null,
    scope: scope as GuardrailScope,
    scope_id: scopeId,
    guardrail_type: guardrailType as GuardrailType,
    enabled: input.enabled ?? true,
    priority,
    severity: severity as GuardrailSeverity,
    enforcement_mode: enforcementMode as EnforcementMode,
    conditions: parsed.conditions as unknown as Json,
    action: parsed.action as unknown as Json,
    message: input.message ? String(input.message).trim().slice(0, 400) : null,
  };
}

/** Creates or updates a tenant guardrail. Platform rows are never touched. */
export async function upsertGuardrail(
  supabase: UserClient,
  ctx: GovernanceContext,
  userId: string,
  input: GuardrailInput,
): Promise<{ id: string }> {
  const row = validate(input);

  if (input.id) {
    const existing = await getOwnGuardrail(supabase, ctx.tenantId, input.id);
    const { data, error } = await supabase
      .from("guardrails")
      .update({ ...row, updated_by: userId } as never)
      .eq("id", existing.id)
      .eq("tenant_id", ctx.tenantId)
      .select("id")
      .maybeSingle();
    if (error || !data) throw saveError("update", error);
    return { id: data.id };
  }

  const { data, error } = await supabase
    .from("guardrails")
    .insert({
      ...row,
      tenant_id: ctx.tenantId,
      is_system: false,
      created_by: userId,
      updated_by: userId,
    } as never)
    .select("id")
    .maybeSingle();
  if (error || !data) throw saveError("insert", error);
  return { id: data.id };
}

async function getOwnGuardrail(supabase: UserClient, tenantId: string, id: string) {
  const { data } = await supabase
    .from("guardrails")
    .select("id, tenant_id, is_system")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.tenant_id !== tenantId) {
    throw new GuardrailError("not_found", GUARDRAIL_ERRORS["not_found"]!);
  }
  if (data.is_system) {
    throw new GuardrailError("system_guardrail", GUARDRAIL_ERRORS["system_guardrail"]!);
  }
  return data;
}

export async function setGuardrailEnabled(
  supabase: UserClient,
  ctx: GovernanceContext,
  userId: string,
  id: string,
  enabled: boolean,
) {
  await getOwnGuardrail(supabase, ctx.tenantId, id);
  const { error } = await supabase
    .from("guardrails")
    .update({ enabled, updated_by: userId } as never)
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId);
  if (error) throw saveError("toggle", error);
}

export async function deleteGuardrail(
  supabase: UserClient,
  ctx: GovernanceContext,
  id: string,
) {
  await getOwnGuardrail(supabase, ctx.tenantId, id);
  const { error } = await supabase
    .from("guardrails")
    .delete()
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId);
  if (error) throw saveError("delete", error);
}

export interface GuardrailRevisionView {
  id: string;
  version: number;
  name: string;
  scope: string;
  scopeId: string | null;
  guardrailType: string;
  enabled: boolean;
  priority: number;
  severity: string;
  enforcementMode: string;
  conditions: GuardrailConditions;
  action: GuardrailAction;
  message: string | null;
  changedBy: string | null;
  createdAt: string;
}

export async function listGuardrailRevisions(
  supabase: UserClient,
  guardrailId: string,
): Promise<GuardrailRevisionView[]> {
  const { data } = await supabase
    .from("guardrail_revisions")
    .select(
      "id, version, name, scope, scope_id, guardrail_type, enabled, priority, severity, enforcement_mode, conditions, action, message, changed_by, created_at",
    )
    .eq("guardrail_id", guardrailId)
    .order("version", { ascending: false })
    .limit(50);

  return (data ?? []).map((r) => ({
    id: r.id,
    version: Number(r.version),
    name: r.name,
    scope: r.scope,
    scopeId: r.scope_id,
    guardrailType: r.guardrail_type,
    enabled: Boolean(r.enabled),
    priority: Number(r.priority),
    severity: r.severity,
    enforcementMode: r.enforcement_mode,
    ...coerceStoredGuardrail(r.conditions, r.action),
    message: r.message,
    changedBy: r.changed_by,
    createdAt: r.created_at,
  }));
}

export interface GuardrailEvaluationView {
  id: string;
  agentKey: string | null;
  provider: string | null;
  capability: string | null;
  actionKey: string | null;
  environment: string;
  executionClass: string | null;
  decision: string;
  simulated: boolean;
  matched: Array<{ id: string; name: string; severity: string; enforced: boolean }>;
  reasons: string[];
  createdAt: string;
}

export async function listGuardrailEvaluations(
  supabase: UserClient,
  tenantId: string,
  limit = 50,
): Promise<GuardrailEvaluationView[]> {
  const { data } = await supabase
    .from("guardrail_evaluations")
    .select(
      "id, agent_key, provider, capability, action_key, environment, execution_class, decision, simulated, matched, reasons, created_at",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));

  return (data ?? []).map((r) => ({
    id: r.id,
    agentKey: r.agent_key,
    provider: r.provider,
    capability: r.capability,
    actionKey: r.action_key,
    environment: r.environment,
    executionClass: r.execution_class,
    decision: r.decision,
    simulated: Boolean(r.simulated),
    matched: Array.isArray(r.matched) ? (r.matched as never) : [],
    reasons: Array.isArray(r.reasons) ? (r.reasons as string[]) : [],
    createdAt: r.created_at,
  }));
}

/**
 * Audit trail for governance changes. The database trigger seals the row and
 * derives the actor from the verified session, so the entry cannot be forged.
 */
export async function auditGuardrailChange(
  supabase: UserClient,
  tenantId: string,
  action:
    | "guardrail.created"
    | "guardrail.updated"
    | "guardrail.enabled"
    | "guardrail.disabled"
    | "guardrail.deleted",
  guardrailId: string,
  detail: string,
  payload: Record<string, unknown> = {},
) {
  const { error } = await supabase.from("audit_log").insert({
    tenant_id: tenantId,
    action,
    entity_type: "guardrail",
    entity_id: guardrailId,
    detail: detail.slice(0, 400),
    payload: payload as unknown as Json,
  });
  if (error) console.error("[guardrails] audit write failed", error.message);
}
