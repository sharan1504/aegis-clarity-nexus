// GUARDRAILS at the tool boundary (MCP tools, agent tools, workflow steps).
//
// Two layers, both mandatory:
//   1. PRE-EXECUTION  — `guardToolCall` denies the call unless guardrails allow
//                       it. Any error denies (fail closed).
//   2. POST-EXECUTION — `guardToolOutput` scrubs the response so no credential
//                       or guardrail-redacted field can leave the server, even
//                       if a tool or connector misbehaves.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { enforceGuardrails } from "./engine.server";
import { GuardrailViolation, type GuardrailContext, type GuardrailVerdict } from "./evaluate";
import { sanitizeOutput } from "./sanitize";

type UserClient = SupabaseClient<Database>;

export interface ToolCallDescriptor {
  tenantId: string;
  userId?: string | null;
  actorRole?: string | null;
  /** Stable tool/action identifier, e.g. "delete_user" or "revoke_license". */
  actionKey: string;
  agentKey?: string | null;
  provider?: string | null;
  integrationId?: string | null;
  capability?: string | null;
  executionClass: GuardrailContext["executionClass"];
  environment?: GuardrailContext["environment"];
  affectedRecords?: number | null;
  confidence?: number | null;
  freshness?: GuardrailContext["freshness"];
  dataClassification?: GuardrailContext["dataClassification"];
  hasChangeTicket?: boolean;
  hasApproval?: boolean;
  hasRollbackPlan?: boolean;
  origin?: string;
}

/** Throws GuardrailViolation unless the tool call is permitted. */
export async function guardToolCall(
  supabase: UserClient,
  descriptor: ToolCallDescriptor,
): Promise<GuardrailVerdict> {
  const { userId, origin, ...rest } = descriptor;
  return enforceGuardrails(
    supabase,
    { ...rest, origin: origin ?? "tool" } as GuardrailContext,
    { userId: userId ?? null, origin: origin ?? "tool" },
  );
}

/** Always applied to tool output, whether or not a verdict is available. */
export function guardToolOutput<T>(value: T, verdict?: GuardrailVerdict | null): T {
  return sanitizeOutput(value, verdict?.redactFields ?? []);
}

/**
 * Runs a governed tool end to end: gate, execute, cap, scrub. Any guardrail
 * denial short-circuits with a structured, user-safe explanation.
 */
export async function runGuardedTool<T>(
  supabase: UserClient,
  descriptor: ToolCallDescriptor,
  run: (verdict: GuardrailVerdict) => Promise<T>,
): Promise<
  | { ok: true; result: T; verdict: GuardrailVerdict }
  | { ok: false; decision: GuardrailVerdict["decision"]; reasons: string[]; requiredActions: string[] }
> {
  let verdict: GuardrailVerdict;
  try {
    verdict = await guardToolCall(supabase, descriptor);
  } catch (error) {
    if (error instanceof GuardrailViolation) {
      return {
        ok: false,
        decision: error.verdict.decision,
        reasons: error.verdict.reasons,
        requiredActions: error.verdict.requiredActions,
      };
    }
    return {
      ok: false,
      decision: "unavailable",
      reasons: ["Guardrails could not be evaluated, so the operation was denied."],
      requiredActions: ["Resolve the governance service error and retry."],
    };
  }

  const raw = await run(verdict);
  return { ok: true, result: guardToolOutput(raw, verdict), verdict };
}
