import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";

export const getOnboardingStatus = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { tenantId } = await resolveTenant(context.supabase, context.userId);
  const [providers, bindings, guardrails] = await Promise.all([
    context.supabase.from("integrations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "connected"),
    context.supabase.from("agent_integration_bindings").select("agent_key,enabled").eq("tenant_id", tenantId).eq("enabled", true),
    context.supabase.from("guardrail_revisions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
  ]);
  if (providers.error) throw new Error(providers.error.message);
  if (bindings.error) throw new Error(bindings.error.message);
  if (guardrails.error) throw new Error(guardrails.error.message);
  return {
    providerCount: providers.count ?? 0,
    deployedAgentCount: new Set((bindings.data ?? []).map((row) => String(row.agent_key))).size,
    guardrailCount: guardrails.count ?? 0,
  };
});
