// Thin server-function wrappers for Organization Instructions & Guidelines.
// All logic lives in ./instructions/service.server.ts. Every write re-checks the
// caller's admin role server-side and forces the tenant from the session.
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listOrganizationInstructions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const g = await import("./guardrails/service.server");
    const s = await import("./instructions/service.server");
    try {
      const ctx = await g.resolveGovernanceContext(context.supabase, context.userId);
      const instructions = await s.listInstructions(context.supabase, ctx.tenantId);
      return { ok: true as const, canManage: ctx.canManage, instructions };
    } catch (error) {
      return { ...s.instructionErrorPayload(error), canManage: false, instructions: [] };
    }
  });

export const saveOrganizationInstruction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, unknown>) => input)
  .handler(async ({ data, context }) => {
    const g = await import("./guardrails/service.server");
    const s = await import("./instructions/service.server");
    try {
      const ctx = await g.requireGuardrailAdmin(context.supabase, context.userId);
      const isUpdate = Boolean(data["id"]);
      const { id } = await s.upsertInstruction(
        context.supabase,
        ctx.tenantId,
        context.userId,
        data as unknown as import("./instructions/types").InstructionInput,
      );
      await s.auditInstructionChange(
        context.supabase,
        ctx.tenantId,
        isUpdate ? "instruction.updated" : "instruction.created",
        id,
        `${isUpdate ? "Updated" : "Created"} instruction "${String(data["name"] ?? "")}"`,
        { scope: data["scope"], category: data["category"] },
      );
      return { ok: true as const, id };
    } catch (error) {
      if (error instanceof Error && error.name === "GuardrailError") {
        return {
          ok: false as const,
          errorCode: "forbidden",
          errorMessage: "Only workspace admins can change instructions and guidelines.",
          issues: [],
        };
      }
      return s.instructionErrorPayload(error);
    }
  });

export const setOrganizationInstructionEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; enabled: boolean }) => ({
    id: String(input.id ?? ""),
    enabled: Boolean(input.enabled),
  }))
  .handler(async ({ data, context }) => {
    const g = await import("./guardrails/service.server");
    const s = await import("./instructions/service.server");
    try {
      const ctx = await g.requireGuardrailAdmin(context.supabase, context.userId);
      await s.setInstructionEnabled(
        context.supabase,
        ctx.tenantId,
        context.userId,
        data.id,
        data.enabled,
      );
      await s.auditInstructionChange(
        context.supabase,
        ctx.tenantId,
        data.enabled ? "instruction.enabled" : "instruction.disabled",
        data.id,
        `${data.enabled ? "Enabled" : "Disabled"} instruction`,
      );
      return { ok: true as const };
    } catch (error) {
      return s.instructionErrorPayload(error);
    }
  });

export const deleteOrganizationInstruction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input.id ?? "") }))
  .handler(async ({ data, context }) => {
    const g = await import("./guardrails/service.server");
    const s = await import("./instructions/service.server");
    try {
      const ctx = await g.requireGuardrailAdmin(context.supabase, context.userId);
      await s.deleteInstruction(context.supabase, ctx.tenantId, data.id);
      await s.auditInstructionChange(
        context.supabase,
        ctx.tenantId,
        "instruction.deleted",
        data.id,
        "Deleted instruction",
      );
      return { ok: true as const };
    } catch (error) {
      return s.instructionErrorPayload(error);
    }
  });

export const getOrganizationInstructionHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input.id ?? "") }))
  .handler(async ({ data, context }) => {
    const g = await import("./guardrails/service.server");
    const s = await import("./instructions/service.server");
    try {
      await g.resolveGovernanceContext(context.supabase, context.userId);
      const revisions = await s.listInstructionRevisions(context.supabase, data.id);
      return { ok: true as const, revisions };
    } catch (error) {
      return { ...s.instructionErrorPayload(error), revisions: [] };
    }
  });

/**
 * Previews the composed guidance for a hypothetical operation, so an admin can
 * see exactly what an agent would receive. Read-only; nothing is executed.
 */
export const previewInstructionGuidance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, unknown>) => input)
  .handler(async ({ data, context }) => {
    const g = await import("./guardrails/service.server");
    const s = await import("./instructions/service.server");
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    try {
      const ctx = await g.resolveGovernanceContext(context.supabase, context.userId);
      const guidance = await s.resolveInstructionGuidance(context.supabase, ctx.tenantId, {
        agentKey: str(data["agentKey"]),
        integrationId: str(data["integrationId"]),
        provider: str(data["provider"]),
        capability: str(data["capability"]),
      });
      return {
        ok: true as const,
        text: guidance.text,
        applied: guidance.applied.map((a) => ({
          id: a.id,
          name: a.name,
          scope: a.scope,
          scopeId: a.scopeId,
          category: a.category,
          priority: a.priority,
        })),
      };
    } catch (error) {
      return { ...s.instructionErrorPayload(error), text: "", applied: [] };
    }
  });
