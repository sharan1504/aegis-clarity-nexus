import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenantContext } from "@/lib/tenant-context.server";

export const getAgentsPageData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId } = await resolveTenantContext(context.supabase, context.userId);
    const [{ data: agents, error: agentsError }, { data: bindings, error: bindingsError }] = await Promise.all([
      context.supabase.from("agent_definitions").select("agent_key,display_name,description,category").order("display_name"),
      context.supabase.from("agent_integration_bindings").select("id,agent_key,enabled,is_mock,integration_id,capability_id").eq("tenant_id", tenantId),
    ]);
    if (agentsError) throw agentsError;
    if (bindingsError) throw bindingsError;
    return { agents: agents ?? [], bindings: bindings ?? [] };
  });
