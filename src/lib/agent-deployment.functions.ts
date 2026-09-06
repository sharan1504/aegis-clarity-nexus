import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEMO_AGENT_KEYS, DEMO_DATA_ENABLED } from "@/lib/demo-data";

export const deployAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentKey: string }) => ({ agentKey: String(input?.agentKey ?? "").trim() }))
  .handler(async ({ data, context }) => {
    if (!data.agentKey) return { ok: false as const, error: "Agent definition is required." };

    // Demo mode intentionally exercises the complete deployment UX without creating
    // fake production bindings or pretending an external provider was contacted.
    if (DEMO_DATA_ENABLED && DEMO_AGENT_KEYS.includes(data.agentKey)) {
      return { ok: true as const, agentKey: data.agentKey, displayName: data.agentKey.replace("agent-", "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), bindingCount: 0, demo: true as const };
    }

    const { data: roles, error: roleError } = await context.supabase
      .from("user_roles").select("tenant_id,role").eq("user_id", context.userId);
    if (roleError) throw roleError;
    const tenantId = roles?.find((r) => r.role === "admin" || r.role === "manager")?.tenant_id;
    if (!tenantId) return { ok: false as const, error: "Admin or manager access is required to deploy an agent." };

    const { data: definition, error: definitionError } = await context.supabase
      .from("agent_definitions").select("agent_key,display_name").eq("agent_key", data.agentKey).maybeSingle();
    if (definitionError) throw definitionError;
    if (!definition) return { ok: false as const, error: "Agent definition was not found." };

    const { data: requirements, error: requirementsError } = await context.supabase
      .from("agent_capabilities")
      .select("capability_id,required,capabilities(capability_key,display_name)")
      .eq("agent_key", data.agentKey);
    if (requirementsError) throw requirementsError;

    const { data: connected, error: connectedError } = await context.supabase
      .from("integrations").select("id,provider,display_name,status,is_mock")
      .eq("tenant_id", tenantId).eq("status", "connected").eq("is_mock", false);
    if (connectedError) throw connectedError;

    const { data: providerCapabilities, error: capabilityError } = await context.supabase
      .from("provider_capabilities").select("provider,capability_id,implemented").eq("implemented", true);
    if (capabilityError) throw capabilityError;

    const supports = (capabilityId: string) => (connected ?? []).some((integration) =>
      (providerCapabilities ?? []).some((pc) => pc.provider === integration.provider && pc.capability_id === capabilityId));
    const required = (requirements ?? []).filter((r) => r.required);
    const missing = required.filter((r) => !supports(r.capability_id));
    if (missing.length) {
      const names = missing.map((m) => {
        const capability = Array.isArray(m.capabilities) ? m.capabilities[0] : m.capabilities;
        return capability?.display_name ?? capability?.capability_key ?? m.capability_id;
      });
      return { ok: false as const, error: `Connect a real provider that supports: ${names.join(", ")}. No binding was created.` };
    }

    const rows: Array<{ tenant_id: string; agent_key: string; integration_id: string; capability_id: string; enabled: boolean; is_mock: boolean; created_by: string }> = [];
    for (const requirement of requirements ?? []) {
      const integration = (connected ?? []).find((candidate) =>
        (providerCapabilities ?? []).some((pc) => pc.provider === candidate.provider && pc.capability_id === requirement.capability_id));
      if (!integration) continue;
      rows.push({ tenant_id: tenantId, agent_key: data.agentKey, integration_id: integration.id,
        capability_id: requirement.capability_id, enabled: true, is_mock: false, created_by: context.userId });
    }
    if (!rows.length) return { ok: false as const, error: "No real connected provider can support this agent yet." };

    const { error: insertError } = await context.supabase.from("agent_integration_bindings")
      .upsert(rows, { onConflict: "tenant_id,agent_key,integration_id,capability_id", ignoreDuplicates: true });
    if (insertError) throw insertError;
    return { ok: true as const, agentKey: data.agentKey, displayName: definition.display_name, bindingCount: rows.length };
  });
