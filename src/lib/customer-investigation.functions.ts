import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";

export type CustomerInvestigationTrail = {
  investigation: Record<string, unknown>;
  steps: Array<Record<string, unknown>>;
  toolInvocations: Array<Record<string, unknown>>;
  resolutions: Array<Record<string, unknown>>;
};

export const getCustomerInvestigationEvidence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { investigationId: string }) => {
    const investigationId = String(input?.investigationId ?? "").trim();
    if (!investigationId) throw new Error("An investigation ID is required.");
    return { investigationId };
  })
  .handler(async ({ data, context }) => {
    const { tenantId } = await resolveTenant(context.supabase, context.userId);
    const db = context.supabase as any;
    const [investigation, steps, tools, resolutions] = await Promise.all([
      db.from("customer_investigations").select("*").eq("id", data.investigationId).eq("tenant_id", tenantId).maybeSingle(),
      db.from("investigation_steps").select("*").eq("investigation_id", data.investigationId).eq("tenant_id", tenantId).order("step_number", { ascending: true }),
      db.from("tool_invocations").select("*").eq("investigation_id", data.investigationId).eq("tenant_id", tenantId).order("started_at", { ascending: true }),
      db.from("customer_resolutions").select("*").eq("investigation_id", data.investigationId).eq("tenant_id", tenantId).order("created_at", { ascending: true }),
    ]);
    if (investigation.error) throw new Error(investigation.error.message);
    if (!investigation.data) throw new Error("Investigation not found in your tenant.");
    if (steps.error) throw new Error(steps.error.message);
    if (tools.error) throw new Error(tools.error.message);
    if (resolutions.error) throw new Error(resolutions.error.message);
    return {
      investigation: investigation.data as Record<string, unknown>,
      steps: (steps.data ?? []) as Array<Record<string, unknown>>,
      toolInvocations: (tools.data ?? []) as Array<Record<string, unknown>>,
      resolutions: (resolutions.data ?? []) as Array<Record<string, unknown>>,
    } satisfies CustomerInvestigationTrail;
  });
