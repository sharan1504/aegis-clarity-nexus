import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { resolveMcpToolCatalog } from "./catalog.server";

const TEMPLATE_MAP: Record<string, { providers: string[] | "*"; toolPrefix: string; entityTypes: string[]; title: string }> = {
  license_inventory: { providers: ["genesys","m365","microsoft365","google-workspace","salesforce"], toolPrefix: "list_license_entitlements", entityTypes: ["license","license_assignment","entitlement"], title: "List license entitlements" },
  user_inventory: { providers: "*", toolPrefix: "list_users", entityTypes: ["user","directory_user","identity"], title: "List users" },
  cost_inventory: { providers: ["aws","azure","gcp"], toolPrefix: "list_cost_signals", entityTypes: ["cost","billing","usage"], title: "List cost signals" },
  cloud_resource_inventory: { providers: ["aws","azure","gcp"], toolPrefix: "list_cloud_resources", entityTypes: ["resource","instance","cloud_resource"], title: "List cloud resources" },
  security_findings: { providers: ["github","gitlab","crowdstrike","microsoft-defender","okta","splunk"], toolPrefix: "list_security_findings", entityTypes: ["finding","vulnerability","security_finding","alert"], title: "List security findings" },
  incident_signals: { providers: ["pagerduty","datadog","newrelic","splunk","servicenow","jira"], toolPrefix: "list_incidents", entityTypes: ["incident","alert"], title: "List incidents" },
  queue_inventory: { providers: ["genesys"], toolPrefix: "list_contact_queues", entityTypes: ["queue"], title: "List contact queues" },
  presence_inventory: { providers: ["genesys"], toolPrefix: "list_user_presence", entityTypes: ["presence","user_presence"], title: "List user presence" },
  knowledge_inventory: { providers: ["confluence","slack","zendesk","freshworks"], toolPrefix: "list_knowledge_sources", entityTypes: ["page","ticket","channel","knowledge_source"], title: "List knowledge sources" },
};

const asDb = (supabase: SupabaseClient<Database>) => supabase as unknown as SupabaseClient;

export async function ensureAgentMcpTools(supabase: SupabaseClient<Database>, tenantId: string, agentKey: string, createdBy?: string) {
  const [{ data: agentCapabilities, error: agentError }, { data: integrations, error: integrationError }, { data: providerCaps, error: providerError }, { data: observed, error: observedError }] = await Promise.all([
    asDb(supabase).from("agent_capabilities").select("capabilities!inner(capability_key)").eq("agent_key", agentKey),
    asDb(supabase).from("integrations").select("id,provider,status,is_mock").eq("tenant_id", tenantId).eq("status","connected").eq("is_mock",false),
    asDb(supabase).from("provider_capabilities").select("provider,capabilities!inner(capability_key),implemented").eq("implemented",true),
    asDb(supabase).from("provider_sync_entities").select("provider,entity_type").eq("tenant_id",tenantId).eq("stale",false).limit(5000),
  ]);
  if (agentError) throw new Error(agentError.message);
  if (integrationError) throw new Error(integrationError.message);
  if (providerError) throw new Error(providerError.message);
  if (observedError) throw new Error(observedError.message);

  const caps = (agentCapabilities ?? []).map((r:any) => r.capabilities?.capability_key).filter(Boolean) as string[];
  const current = await resolveMcpToolCatalog(supabase, tenantId);
  const created: string[] = [], bound: string[] = [], skipped: string[] = [];
  const observedByProvider = new Map<string, Set<string>>();
  for (const row of observed ?? []) {
    const set = observedByProvider.get(row.provider) ?? new Set<string>();
    set.add(row.entity_type);
    observedByProvider.set(row.provider,set);
  }

  for (const capability of caps) {
    const template = TEMPLATE_MAP[capability];
    if (!template) continue;
    const providers = (integrations ?? []).filter((i:any) => template.providers === "*" || template.providers.includes(i.provider));
    for (const integration of providers) {
      const implemented = (providerCaps ?? []).some((pc:any) => pc.provider === integration.provider && pc.capabilities?.capability_key === capability);
      const entities = observedByProvider.get(integration.provider) ?? new Set<string>();
      const hasEvidencePath = implemented || template.entityTypes.some((t) => entities.has(t));
      if (!hasEvidencePath) {
        skipped.push(capability + "/" + integration.provider + ":no evidence path");
        continue;
      }

      const toolName = template.toolPrefix + "_" + integration.provider;
      if (!current.some((tool) => tool.name === toolName)) {
        const { error } = await asDb(supabase).from("mcp_tool_definitions").upsert({
          tool_name: toolName,
          title: template.title + " — " + integration.provider,
          description: "Read synchronized " + capability + " evidence from " + integration.provider + ".",
          capability_key: capability,
          provider: integration.provider,
          execution_class: "read_only",
          read_only: true,
          origin: "auto",
          handler_kind: "entity_query",
          handler_config: { entityTypes: template.entityTypes, provider: integration.provider },
          enabled: true,
          created_by: createdBy ?? null,
        }, { onConflict: "tool_name" });
        if (error) throw new Error(error.message);
        created.push(toolName);
      }

      const cap = await asDb(supabase).from("capabilities").select("id").eq("capability_key", capability).maybeSingle();
      if (cap.error || !cap.data?.id) {
        skipped.push(capability + "/" + integration.provider + ":capability missing");
        continue;
      }

      const existing = await asDb(supabase).from("agent_integration_bindings")
        .select("id")
        .eq("tenant_id",tenantId)
        .eq("agent_key",agentKey)
        .eq("integration_id",integration.id)
        .eq("capability_id",cap.data.id)
        .maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (!existing.data) {
        const { error } = await asDb(supabase).from("agent_integration_bindings").insert({
          tenant_id:tenantId,
          agent_key:agentKey,
          integration_id:integration.id,
          capability_id:cap.data.id,
          enabled:true,
          is_mock:false,
          created_by:createdBy ?? null,
        });
        if (error) throw new Error(error.message);
        bound.push(agentKey + "/" + integration.provider + "/" + capability);
      }
    }
  }
  return { created, bound, skipped };
}
