import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { capabilityRouter } from "@/lib/capabilities/router.server";
import { loadLiveWorkspaceData } from "@/lib/live-workspace.functions";
import { loadProviderReportData } from "@/lib/provider-sync.functions";
import { DEMO_AWS, DEMO_GENESYS, DEMO_INTEGRATIONS, DEMO_AUDIT_EVENTS } from "@/lib/demo-data";
import { resolveTenantContext } from "@/lib/tenant-context.server";
import { LICENSE_AGENT_KEY } from "@/lib/agents/license/types";

export const getReportWorkspaceData = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { environmentMode } = await resolveTenantContext(context.supabase, context.userId);
  if (environmentMode === "demo") {
    return {
      genesys: await loadLiveWorkspaceData(context.supabase, context.userId),
      license: { records: [], sources: [], warnings: ["License inventory is unavailable in demo mode."], freshness: "unavailable" as const },
      providers: {
        connectedProviders: DEMO_INTEGRATIONS.filter((item) => item.status === "connected").map((item) => ({ id: item.id, provider: item.provider, status: item.status, display_name: item.provider === "aws" ? DEMO_AWS.displayName : DEMO_GENESYS.orgName, last_sync_at: item.lastSyncAt })),
        entities: DEMO_AUDIT_EVENTS.map((item) => ({ provider: item.entityType === "vulnerability" || item.entityType === "agent" ? "aws" : "genesys", connection_id: item.entityId, entity_type: item.entityType, entity_key: item.entityId, payload: { action: item.action, detail: item.detail }, observed_at: item.createdAt })),
        runs: DEMO_INTEGRATIONS.map((item) => ({ provider: item.provider, connection_id: item.id, status: item.lastSyncStatus, started_at: item.lastSyncAt, finished_at: item.lastSyncAt, records_seen: item.provider === "aws" ? DEMO_AWS.resources : DEMO_GENESYS.users, error_message: null })),
        department: { key: null, name: "All departments", unrestricted: true },
      },
      fetchedAt: new Date().toISOString(),
    };
  }

  const [genesys, providers, license] = await Promise.all([
    loadLiveWorkspaceData(context.supabase, context.userId),
    loadProviderReportData(context.supabase, context.userId),
    capabilityRouter.getLicenseInventory(context.supabase, context.userId, LICENSE_AGENT_KEY),
  ]);
  return { genesys, providers, license, fetchedAt: new Date().toISOString() };
});
