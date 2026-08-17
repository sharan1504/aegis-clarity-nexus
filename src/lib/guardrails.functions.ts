// Thin server-function wrappers for the Guardrails governance layer.
// All logic lives in ./guardrails/*.server.ts so nothing privileged reaches the
// client bundle. Every write re-checks the caller's role server-side.
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listGuardrails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await import("./guardrails/service.server");
    try {
      const ctx = await s.resolveGovernanceContext(context.supabase, context.userId);
      const [guardrails, evaluations] = await Promise.all([
        s.listGuardrails(context.supabase, ctx.tenantId),
        s.listGuardrailEvaluations(context.supabase, ctx.tenantId, 50),
      ]);
      return { ok: true as const, canManage: ctx.canManage, guardrails, evaluations };
    } catch (error) {
      return {
        ...s.guardrailErrorPayload(error),
        canManage: false,
        guardrails: [],
        evaluations: [],
      };
    }
  });

export const saveGuardrail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, unknown>) => input)
  .handler(async ({ data, context }) => {
    const s = await import("./guardrails/service.server");
    try {
      const ctx = await s.requireGuardrailAdmin(context.supabase, context.userId);
      const isUpdate = Boolean(data["id"]);
      const { id } = await s.upsertGuardrail(
        context.supabase,
        ctx,
        context.userId,
        data as unknown as import("./guardrails/service.server").GuardrailInput,
      );
      await s.auditGuardrailChange(
        context.supabase,
        ctx.tenantId,
        isUpdate ? "guardrail.updated" : "guardrail.created",
        id,
        `${isUpdate ? "Updated" : "Created"} guardrail "${String(data["name"] ?? "")}"`,
        { scope: data["scope"], guardrailType: data["guardrailType"] },
      );
      return { ok: true as const, id };
    } catch (error) {
      return s.guardrailErrorPayload(error);
    }
  });

export const setGuardrailEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; enabled: boolean }) => ({
    id: String(input.id ?? ""),
    enabled: Boolean(input.enabled),
  }))
  .handler(async ({ data, context }) => {
    const s = await import("./guardrails/service.server");
    try {
      const ctx = await s.requireGuardrailAdmin(context.supabase, context.userId);
      await s.setGuardrailEnabled(context.supabase, ctx, context.userId, data.id, data.enabled);
      await s.auditGuardrailChange(
        context.supabase,
        ctx.tenantId,
        data.enabled ? "guardrail.enabled" : "guardrail.disabled",
        data.id,
        `${data.enabled ? "Enabled" : "Disabled"} guardrail`,
      );
      return { ok: true as const };
    } catch (error) {
      return s.guardrailErrorPayload(error);
    }
  });

export const deleteGuardrail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input.id ?? "") }))
  .handler(async ({ data, context }) => {
    const s = await import("./guardrails/service.server");
    try {
      const ctx = await s.requireGuardrailAdmin(context.supabase, context.userId);
      await s.deleteGuardrail(context.supabase, ctx, data.id);
      await s.auditGuardrailChange(
        context.supabase,
        ctx.tenantId,
        "guardrail.deleted",
        data.id,
        "Deleted guardrail",
      );
      return { ok: true as const };
    } catch (error) {
      return s.guardrailErrorPayload(error);
    }
  });

export const getGuardrailHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input.id ?? "") }))
  .handler(async ({ data, context }) => {
    const s = await import("./guardrails/service.server");
    try {
      await s.resolveGovernanceContext(context.supabase, context.userId);
      const revisions = await s.listGuardrailRevisions(context.supabase, data.id);
      return { ok: true as const, revisions };
    } catch (error) {
      return { ...s.guardrailErrorPayload(error), revisions: [] };
    }
  });

/**
 * Guardrail simulator. Runs the SAME evaluation path as real enforcement, so a
 * simulated verdict is authoritative. Nothing is executed and nothing is
 * written except the (simulated) evaluation record.
 */
export const simulateGuardrails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, unknown>) => input)
  .handler(async ({ data, context }) => {
    const s = await import("./guardrails/service.server");
    const engine = await import("./guardrails/engine.server");
    const { buildSimulationContext } = await import("./guardrails/simulation.server");
    try {
      const ctx = await s.resolveGovernanceContext(context.supabase, context.userId);
      const simulationContext = buildSimulationContext(ctx.tenantId, ctx.roles, data);
      const verdict = await engine.simulateGuardrails(context.supabase, simulationContext, {
        userId: context.userId,
        origin: "simulator",
      });
      return { ok: true as const, verdict, context: simulationContext };
    } catch (error) {
      return { ...s.guardrailErrorPayload(error), verdict: null, context: null };
    }
  });
