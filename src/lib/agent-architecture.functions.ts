// Thin server-function wrappers for the Agent <-> Connector architecture.
// All logic lives in ./capabilities/*.server.ts so nothing credential-bearing
// can reach the client bundle.
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listAgentDefinitions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("agent_definitions")
      .select("agent_key, display_name, description, category")
      .order("display_name");
    return { agents: data ?? [] };
  });

export const getAgentDataSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentKey: string }) => ({ agentKey: String(input.agentKey ?? "") }))
  .handler(async ({ data, context }) => {
    const b = await import("./capabilities/bindings.server");
    try {
      const ctx = await b.resolveTenant(context.supabase, context.userId);
      const view = await b.getAgentDataSources(context.supabase, ctx.tenantId, data.agentKey);
      const settings = await b.getAgentSettings(context.supabase, ctx.tenantId, data.agentKey);
      return { ok: true as const, canManage: ctx.canManage, ...view, settings };
    } catch (error) {
      return {
        ...b.bindingErrorPayload(error),
        canManage: false,
        bindings: [],
        integrations: [],
        agentCapabilities: [],
        settings: { preInstructions: "", systemInstructions: "", postInstructions: "" },
      };
    }
  });

export const addAgentDataSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentKey: string; integrationId: string; capabilityKey: string }) => ({
    agentKey: String(input.agentKey ?? ""),
    integrationId: String(input.integrationId ?? ""),
    capabilityKey: String(input.capabilityKey ?? ""),
  }))
  .handler(async ({ data, context }) => {
    const b = await import("./capabilities/bindings.server");
    try {
      const ctx = await b.requireManage(context.supabase, context.userId);
      await b.createBinding(context.supabase, ctx, context.userId, data);
      return { ok: true as const };
    } catch (error) {
      return b.bindingErrorPayload(error);
    }
  });

export const updateAgentDataSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { bindingId: string; enabled?: boolean }) => ({
    bindingId: String(input.bindingId ?? ""),
    ...(typeof input.enabled === "boolean" ? { enabled: input.enabled } : {}),
  }))
  .handler(async ({ data, context }) => {
    const b = await import("./capabilities/bindings.server");
    try {
      const ctx = await b.requireManage(context.supabase, context.userId);
      await b.setBindingState(context.supabase, ctx, data);
      return { ok: true as const };
    } catch (error) {
      return b.bindingErrorPayload(error);
    }
  });

/**
 * Saves the decision policy for one binding (tenant + agent + integration +
 * capability). The raw input is passed through untouched so the server-side
 * schema validator — not the browser — decides what is acceptable. The policy
 * version is incremented by the database.
 */
export const saveAgentIntegrationPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { bindingId: string; policy: unknown }) => ({
    bindingId: String(input.bindingId ?? ""),
    policy: input.policy as unknown,
  }))
  .handler(async ({ data, context }) => {
    const b = await import("./capabilities/bindings.server");
    try {
      const ctx = await b.requireManage(context.supabase, context.userId);
      await b.setBindingState(context.supabase, ctx, {
        bindingId: data.bindingId,
        policy: data.policy,
      });
      return { ok: true as const };
    } catch (error) {
      return b.bindingErrorPayload(error);
    }
  });

export const removeAgentDataSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { bindingId: string }) => ({ bindingId: String(input.bindingId ?? "") }))
  .handler(async ({ data, context }) => {
    const b = await import("./capabilities/bindings.server");
    try {
      const ctx = await b.requireManage(context.supabase, context.userId);
      await b.removeBinding(context.supabase, ctx, data.bindingId);
      return { ok: true as const };
    } catch (error) {
      return b.bindingErrorPayload(error);
    }
  });

export const saveAgentInstructions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      agentKey: string;
      preInstructions: string;
      systemInstructions: string;
      postInstructions: string;
    }) => ({
      agentKey: String(input.agentKey ?? ""),
      preInstructions: String(input.preInstructions ?? "").slice(0, 4000),
      systemInstructions: String(input.systemInstructions ?? "").slice(0, 4000),
      postInstructions: String(input.postInstructions ?? "").slice(0, 4000),
    }),
  )
  .handler(async ({ data, context }) => {
    const b = await import("./capabilities/bindings.server");
    try {
      const ctx = await b.requireManage(context.supabase, context.userId);
      await b.saveAgentSettings(context.supabase, ctx, context.userId, data);
      return { ok: true as const };
    } catch (error) {
      return b.bindingErrorPayload(error);
    }
  });

/**
 * Read-only capability preview through the Capability Router. Proves the
 * agent-facing surface is provider-neutral, binding-authorized, provenance- and
 * freshness-aware. It performs no reasoning and no writes.
 *
 * Note the input surface: only agentKey + capabilityKey. Tenant, integration
 * and provider are resolved server-side from authorized records, so no caller
 * (including a future LLM tool call) can widen access by supplying an id.
 */
export const previewAgentCapability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentKey: string; capabilityKey: string }) => ({
    agentKey: String(input.agentKey ?? ""),
    capabilityKey: String(input.capabilityKey ?? ""),
  }))
  .handler(async ({ data, context }) => {
    const b = await import("./capabilities/bindings.server");
    const { CAPABILITY_ROUTER_CALLS } = await import("./capabilities/router.server");
    try {
      const call = CAPABILITY_ROUTER_CALLS[data.capabilityKey];
      if (!call) {
        return {
          ok: false as const,
          errorCode: "capability_not_supported_by_provider",
          errorMessage: "No provider implementation is wired for that capability yet.",
          issues: [],
          sources: [],
          recordCount: 0,
          warnings: [] as string[],
          freshness: "unavailable" as const,
          evaluatedAt: new Date().toISOString(),
        };
      }

      const result = await call(context.supabase, context.userId, data.agentKey);
      if (result.denied) {
        return {
          ok: false as const,
          errorCode: result.denied.reason,
          errorMessage: result.denied.message,
          issues: [],
          sources: [],
          recordCount: 0,
          warnings: result.warnings,
          freshness: result.freshness,
          evaluatedAt: result.evaluatedAt,
        };
      }

      return {
        ok: true as const,
        recordCount: result.records.length,
        sources: result.sources,
        warnings: result.warnings,
        freshness: result.freshness,
        evaluatedAt: result.evaluatedAt,
      };
    } catch (error) {
      return {
        ...b.bindingErrorPayload(error),
        sources: [],
        recordCount: 0,
        warnings: [] as string[],
        freshness: "unavailable" as const,
        evaluatedAt: new Date().toISOString(),
      };
    }
  });
