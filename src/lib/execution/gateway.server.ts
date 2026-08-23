// UNIFIED EXECUTION GATE (server-only).
//
// Every governed operation — agent step, capability read, MCP tool, workflow
// step, background job, internal API — goes through `runGovernedOperation`.
// There is deliberately no second path: the guardrail engine is not something a
// caller can choose to consult.
//
// What the gate guarantees, in order:
//   1. IDENTITY      — the actor is resolved from a verified token, never from
//                      caller-supplied fields. Tenant and role come from the
//                      database, not from the request body.
//   2. ENFORCEMENT   — guardrails are evaluated server-side; a non-allow verdict
//                      short-circuits before the operation function is invoked.
//   3. LIMITS        — a `max_records` cap from a guardrail is applied to the
//                      result by the server, not trusted to the tool.
//   4. SANITIZATION  — output is scrubbed of credentials and guardrail-redacted
//                      fields on the way out.
//   5. FAIL CLOSED   — any error resolving identity or evaluating guardrails
//                      denies the operation.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { guardToolOutput, type ToolCallDescriptor } from "@/lib/guardrails/tool-gate.server";
import { enforceGuardrails } from "@/lib/guardrails/engine.server";
import {
  GuardrailViolation,
  type GuardrailContext,
  type GuardrailVerdict,
} from "@/lib/guardrails/evaluate";

export type UserClient = SupabaseClient<Database>;

export type ExecutionOrigin =
  | "ui"
  | "agent"
  | "capability_router"
  | "mcp"
  | "workflow"
  | "job"
  | "api"
  | "simulator";

const ROLE_RANK = ["admin", "manager", "analyst", "viewer"];

export function userClientFromToken(token: string): UserClient {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("governance_unavailable: Supabase env missing");

  const isOpaque = key.startsWith("sb_publishable_") || key.startsWith("sb_secret_");
  return createClient<Database>(url, key, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (isOpaque && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        headers.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export interface ActorContext {
  userId: string;
  tenantId: string;
  roles: string[];
  actorRole: string;
}

export async function resolveActor(supabase: UserClient, userId: string): Promise<ActorContext> {
  const { data: profile, error } = await supabase.from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
  if (error) throw new Error(`governance_unavailable: ${error.message}`);
  const tenantId = profile?.tenant_id;
  if (!tenantId) throw new Error("no_tenant");

  const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("tenant_id", tenantId);
  const roles = (roleRows ?? []).map((r) => String(r.role));
  const actorRole = ROLE_RANK.find((r) => roles.includes(r)) ?? (roles[0] as string | undefined) ?? "viewer";
  return { userId, tenantId, roles, actorRole };
}

export interface GovernedOperation {
  origin: ExecutionOrigin;
  actionKey: string;
  executionClass: GuardrailContext["executionClass"];
  agentKey?: string | null;
  provider?: string | null;
  integrationId?: string | null;
  capability?: string | null;
  environment?: GuardrailContext["environment"];
  affectedRecords?: number | null;
  confidence?: number | null;
  freshness?: GuardrailContext["freshness"];
  dataClassification?: GuardrailContext["dataClassification"];
  hasChangeTicket?: boolean;
  hasApproval?: boolean;
  hasRollbackPlan?: boolean;
  changeRecordId?: string | null;
}

export type GovernedResult<T> =
  | { ok: true; result: T; verdict: GuardrailVerdict; capped: boolean }
  | { ok: false; decision: GuardrailVerdict["decision"]; reasons: string[]; requiredActions: string[] };

function denial(decision: GuardrailVerdict["decision"], reasons: string[], requiredActions: string[]): GovernedResult<never> {
  return { ok: false, decision, reasons, requiredActions };
}

function applyRecordCap<T>(value: T, maxRecords: number | null): { value: T; capped: boolean } {
  if (maxRecords == null || maxRecords < 0) return { value, capped: false };
  if (Array.isArray(value)) {
    if (value.length <= maxRecords) return { value, capped: false };
    return { value: value.slice(0, maxRecords) as unknown as T, capped: true };
  }
  if (value && typeof value === "object") {
    let capped = false;
    const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const [key, child] of Object.entries(out)) {
      if (Array.isArray(child) && child.length > maxRecords) {
        out[key] = child.slice(0, maxRecords);
        capped = true;
      }
    }
    return capped ? { value: out as unknown as T, capped } : { value, capped: false };
  }
  return { value, capped: false };
}

async function requireWorkspaceApprovalForWrite(supabase: UserClient, tenantId: string, operation: GovernedOperation): Promise<GovernedResult<never> | null> {
  if (operation.executionClass === "read_only") return null;
  const { data, error } = await supabase.from("tenants").select("analytics_settings").eq("id", tenantId).single();
  if (error) return denial("unavailable", ["Workspace security settings could not be evaluated; the write was denied."], ["Resolve workspace settings access and retry."]);
  const settings = data?.analytics_settings && typeof data.analytics_settings === "object" ? data.analytics_settings as Record<string, unknown> : {};
  const security = settings.security && typeof settings.security === "object" ? settings.security as Record<string, unknown> : {};
  if (security.requireApprovalForWrites === false || operation.hasApproval === true) return null;
  return denial("block", ["Workspace policy requires an approved change record before write actions can execute."], ["Create or link an approved change record before executing this write."]);
}

export async function runGovernedOperation<T>(supabase: UserClient, actor: ActorContext, operation: GovernedOperation, run: (verdict: GuardrailVerdict) => Promise<T> | T): Promise<GovernedResult<T>> {
  const descriptor: ToolCallDescriptor = {
    tenantId: actor.tenantId,
    userId: actor.userId,
    actorRole: actor.actorRole,
    actionKey: operation.actionKey,
    executionClass: operation.executionClass,
    agentKey: operation.agentKey ?? null,
    provider: operation.provider ?? null,
    integrationId: operation.integrationId ?? null,
    capability: operation.capability ?? null,
    ...(operation.environment ? { environment: operation.environment } : {}),
    affectedRecords: operation.affectedRecords ?? null,
    confidence: operation.confidence ?? null,
    ...(operation.freshness ? { freshness: operation.freshness } : {}),
    ...(operation.dataClassification ? { dataClassification: operation.dataClassification } : {}),
    hasChangeTicket: Boolean(operation.hasChangeTicket),
    hasApproval: Boolean(operation.hasApproval),
    hasRollbackPlan: Boolean(operation.hasRollbackPlan),
    origin: operation.origin,
  };

  const policy = await requireWorkspaceApprovalForWrite(supabase, actor.tenantId, operation);
  if (policy) return policy;

  let verdict: GuardrailVerdict;
  try {
    const { userId, origin, ...ctx } = descriptor;
    verdict = await enforceGuardrails(supabase, ctx as GuardrailContext, { userId, origin, changeRecordId: operation.changeRecordId ?? null });
  } catch (error) {
    if (error instanceof GuardrailViolation) return denial(error.verdict.decision, error.verdict.reasons, error.verdict.requiredActions);
    console.error("[gateway] guardrail evaluation failed", (error as Error).message);
    return denial("unavailable", ["Guardrails could not be evaluated, so the operation was denied."], ["Resolve the governance service error and retry."]);
  }

  let raw: T;
  try {
    raw = await run(verdict);
  } catch (error) {
    console.error("[gateway] operation failed", (error as Error).message);
    throw error;
  }

  const { value, capped } = applyRecordCap(raw, verdict.maxRecords);
  return { ok: true, result: guardToolOutput(value, verdict), verdict, capped };
}

export async function runGovernedWithToken<T>(token: string | undefined, userId: string | undefined, operation: GovernedOperation, run: (verdict: GuardrailVerdict, supabase: UserClient, actor: ActorContext) => Promise<T> | T): Promise<GovernedResult<T>> {
  if (!token || !userId) return denial("block", ["This operation requires an authenticated caller."], ["Sign in and retry."]);

  let supabase: UserClient;
  let actor: ActorContext;
  try {
    supabase = userClientFromToken(token);
    actor = await resolveActor(supabase, userId);
  } catch (error) {
    const message = (error as Error).message;
    console.error("[gateway] actor resolution failed", message);
    return denial(message === "no_tenant" ? "block" : "unavailable", [message === "no_tenant" ? "Your account is not attached to a workspace, so no operation can be governed." : "The governance layer could not verify who is asking, so the operation was denied."], ["Contact a workspace administrator."]);
  }

  return runGovernedOperation(supabase, actor, operation, (verdict) => run(verdict, supabase, actor));
}
