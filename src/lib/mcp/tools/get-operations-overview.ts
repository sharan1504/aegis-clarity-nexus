import { defineTool } from "@lovable.dev/mcp-js";
import { getMcpTenantContext } from "@/lib/mcp/tenant-data";

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

export default defineTool({
  name: "get_operations_overview",
  title: "Get operations overview",
  description: "Compute an operations snapshot from this tenant's real audit, change, integration, and synchronized-provider telemetry.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, rawCtx) => {
    try {
      const { supabase, actor } = await getMcpTenantContext(rawCtx);
      const since = daysAgo(30);
      const [audit, auditEvents, users, roles, changes, integrations, syncEntities] = await Promise.all([
        supabase.from("audit_log").select("action,actor_email,entity_type,entity_id,created_at,payload").eq("tenant_id", actor.tenantId).gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
        supabase.from("audit_events").select("action,actor_email,resource_type,target_id,created_at,metadata").eq("tenant_id", actor.tenantId).gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
        supabase.from("profiles").select("id").eq("tenant_id", actor.tenantId),
        supabase.from("user_roles").select("role").eq("tenant_id", actor.tenantId),
        supabase.from("change_records").select("change_id,stage,severity,created_at").eq("tenant_id", actor.tenantId).gte("created_at", since),
        supabase.from("integrations").select("provider,display_name,status,last_synced_at").eq("tenant_id", actor.tenantId),
        supabase.from("provider_sync_entities").select("provider,entity_type").eq("tenant_id", actor.tenantId).eq("stale", false),
      ]);
      for (const result of [audit, auditEvents, users, roles, changes, integrations, syncEntities]) if (result.error) throw result.error;
      const auditRows = [...(audit.data ?? []), ...(auditEvents.data ?? []).map((x: any) => ({ ...x, entity_type: x.resource_type, entity_id: x.target_id }))].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const changeRows = changes.data ?? [];
      const byAction = (pattern: RegExp) => auditRows.filter((x: any) => pattern.test(String(x.action))).length;
      const syncByProvider = new Map<string, number>();
      for (const row of syncEntities.data ?? []) syncByProvider.set(row.provider, (syncByProvider.get(row.provider) ?? 0) + 1);
      const overview = {
        period: { from: since, to: new Date().toISOString() },
        platform: {
          totalEvents: auditRows.length,
          activeUsers: new Set(auditRows.map((x: any) => x.actor_email).filter(Boolean)).size,
          totalUsers: (users.data ?? []).length,
          connectedRoles: new Set((roles.data ?? []).map((x: any) => x.role)).size,
          changeRecords: changeRows.length,
          pendingChanges: changeRows.filter((x: any) => ["Proposed", "Owner Review", "Change Created", "Team Approvals", "Ready to Execute"].includes(x.stage)).length,
          connectedIntegrations: (integrations.data ?? []).filter((x: any) => x.status === "connected").length,
        },
        activity: { additions: byAction(/user\.(added|created|invited)/i), removals: byAction(/user\.(removed|deleted)/i), updates: byAction(/user\.(updated|role_changed|changed)/i), failedEvents: byAction(/failed|failure|error/i) },
        providers: (integrations.data ?? []).map((i: any) => ({ provider: i.provider, displayName: i.display_name, status: i.status, lastSyncedAt: i.last_synced_at, activeSyncedRecords: syncByProvider.get(i.provider) ?? 0 })),
        recentEvents: auditRows.slice(0, 25),
      };
      return { content: [{ type: "text", text: JSON.stringify(overview, null, 2) }], structuredContent: overview };
    } catch (error) {
      return { content: [{ type: "text", text: error instanceof Error ? error.message : "Unable to read operations telemetry." }], isError: true };
    }
  },
});
