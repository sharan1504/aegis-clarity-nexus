// ORGANIZATION INSTRUCTIONS & GUIDELINES — management + composition (server-only).
//
// Instructions are behavioural GUIDANCE. This module deliberately has no
// authorization surface of its own beyond "who may author them": composing an
// instruction into an agent's context never changes a guardrail verdict, and no
// caller can use an instruction to reach data or an action it could not
// otherwise reach.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";
import {
  composeInstructions,
  validateInstruction,
  type InstructionCategory,
  type InstructionInput,
  type InstructionIssue,
  type InstructionRecord,
  type InstructionRevisionView,
  type InstructionScope,
  type InstructionTarget,
} from "./types";

type UserClient = SupabaseClient<Database>;

export class InstructionError extends Error {
  code: string;
  issues: InstructionIssue[];
  constructor(code: string, message: string, issues: InstructionIssue[] = []) {
    super(message);
    this.code = code;
    this.issues = issues;
    this.name = "InstructionError";
  }
}

export const INSTRUCTION_ERRORS: Record<string, string> = {
  no_tenant: "Your account is not attached to a workspace yet.",
  forbidden: "Only workspace admins can change instructions and guidelines.",
  not_found: "That instruction does not exist in this workspace.",
  invalid_instruction: "That instruction contains values the platform will not accept.",
  save_failed: "The instruction could not be saved. Please try again.",
};

export function instructionErrorPayload(error: unknown) {
  const code = error instanceof InstructionError ? error.code : "save_failed";
  const issues = error instanceof InstructionError ? error.issues : [];
  return {
    ok: false as const,
    errorCode: code,
    errorMessage: (issues[0]?.message ??
      INSTRUCTION_ERRORS[code] ??
      INSTRUCTION_ERRORS["save_failed"]) as string,
    issues,
  };
}

const COLUMNS =
  "id, tenant_id, name, description, instruction_text, category, scope, scope_id, priority, enabled, version, created_at, updated_at";

type Row = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  instruction_text: string;
  category: string;
  scope: string;
  scope_id: string | null;
  priority: number;
  enabled: boolean;
  version: number;
  created_at?: string;
  updated_at?: string;
};

function mapRow(row: Row): InstructionRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    instructionText: row.instruction_text,
    category: row.category as InstructionCategory,
    scope: row.scope as InstructionScope,
    scopeId: row.scope_id,
    priority: Number(row.priority ?? 100),
    enabled: Boolean(row.enabled),
    version: Number(row.version ?? 1),
    ...(row.created_at ? { createdAt: row.created_at } : {}),
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  };
}

export async function listInstructions(
  supabase: UserClient,
  tenantId: string,
): Promise<InstructionRecord[]> {
  const { data, error } = await supabase
    .from("organization_instructions")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .order("priority", { ascending: true });
  if (error) {
    console.error("[instructions] list failed", error.message);
    throw new InstructionError("save_failed", INSTRUCTION_ERRORS["save_failed"]!);
  }
  return (data ?? []).map((r) => mapRow(r as unknown as Row));
}

async function getOwn(supabase: UserClient, tenantId: string, id: string) {
  const { data } = await supabase
    .from("organization_instructions")
    .select("id, tenant_id")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.tenant_id !== tenantId) {
    throw new InstructionError("not_found", INSTRUCTION_ERRORS["not_found"]!);
  }
  return data;
}

export async function upsertInstruction(
  supabase: UserClient,
  tenantId: string,
  userId: string,
  input: InstructionInput,
): Promise<{ id: string }> {
  const parsed = validateInstruction(input);
  if (!parsed.ok) {
    throw new InstructionError(
      "invalid_instruction",
      INSTRUCTION_ERRORS["invalid_instruction"]!,
      parsed.issues,
    );
  }

  if (input.id) {
    await getOwn(supabase, tenantId, input.id);
    const { data, error } = await supabase
      .from("organization_instructions")
      .update({ ...parsed.value, updated_by: userId } as never)
      .eq("id", input.id)
      .eq("tenant_id", tenantId)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      console.error("[instructions] update failed", error?.message);
      throw new InstructionError("save_failed", INSTRUCTION_ERRORS["save_failed"]!);
    }
    return { id: data.id };
  }

  const { data, error } = await supabase
    .from("organization_instructions")
    .insert({
      ...parsed.value,
      tenant_id: tenantId,
      created_by: userId,
      updated_by: userId,
    } as never)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("[instructions] insert failed", error?.message);
    throw new InstructionError("save_failed", INSTRUCTION_ERRORS["save_failed"]!);
  }
  return { id: data.id };
}

export async function setInstructionEnabled(
  supabase: UserClient,
  tenantId: string,
  userId: string,
  id: string,
  enabled: boolean,
) {
  await getOwn(supabase, tenantId, id);
  const { error } = await supabase
    .from("organization_instructions")
    .update({ enabled, updated_by: userId } as never)
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) {
    console.error("[instructions] toggle failed", error.message);
    throw new InstructionError("save_failed", INSTRUCTION_ERRORS["save_failed"]!);
  }
}

export async function deleteInstruction(supabase: UserClient, tenantId: string, id: string) {
  await getOwn(supabase, tenantId, id);
  const { error } = await supabase
    .from("organization_instructions")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) {
    console.error("[instructions] delete failed", error.message);
    throw new InstructionError("save_failed", INSTRUCTION_ERRORS["save_failed"]!);
  }
}

export async function listInstructionRevisions(
  supabase: UserClient,
  instructionId: string,
): Promise<InstructionRevisionView[]> {
  const { data } = await supabase
    .from("organization_instruction_revisions")
    .select(
      "id, version, name, instruction_text, category, scope, scope_id, priority, enabled, changed_by, created_at",
    )
    .eq("instruction_id", instructionId)
    .order("version", { ascending: false })
    .limit(50);

  return (data ?? []).map((r) => ({
    id: r.id,
    version: Number(r.version),
    name: r.name,
    instructionText: r.instruction_text,
    category: r.category,
    scope: r.scope,
    scopeId: r.scope_id,
    priority: Number(r.priority),
    enabled: Boolean(r.enabled),
    changedBy: r.changed_by,
    createdAt: r.created_at,
  }));
}

/**
 * Guidance block for one operation. Returns an empty string when nothing
 * applies. Never called as part of an authorization decision.
 */
export async function resolveInstructionGuidance(
  supabase: UserClient,
  tenantId: string,
  target: InstructionTarget,
): Promise<{ text: string; applied: InstructionRecord[] }> {
  try {
    const records = await listInstructions(supabase, tenantId);
    return composeInstructions(records, target);
  } catch {
    // Guidance is advisory: its absence must never block a governed operation.
    return { text: "", applied: [] };
  }
}

export async function auditInstructionChange(
  supabase: UserClient,
  tenantId: string,
  action:
    | "instruction.created"
    | "instruction.updated"
    | "instruction.enabled"
    | "instruction.disabled"
    | "instruction.deleted",
  instructionId: string,
  detail: string,
  payload: Record<string, unknown> = {},
) {
  const { error } = await supabase.from("audit_log").insert({
    tenant_id: tenantId,
    action,
    entity_type: "instruction",
    entity_id: instructionId,
    detail: detail.slice(0, 400),
    payload: payload as unknown as Json,
  });
  if (error) console.error("[instructions] audit write failed", error.message);
}
