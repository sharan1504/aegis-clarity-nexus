import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadLiveWorkspaceData } from "@/lib/live-workspace.functions";
import { loadProviderReportData } from "@/lib/provider-sync.functions";
import { DEMO_DATA_ENABLED, DEMO_AWS, DEMO_INTEGRATIONS, DEMO_CHANGES, DEMO_AUDIT_EVENTS } from "@/lib/demo-data";

export const getReportWorkspaceData = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  if (DEMO_DATA_ENABLED) {
    return {
      genesys: await loadLiveWorkspaceData(context.supabase, context.userId),
      providers: {
        connectedProviders: DEMO_INTEGRATIONS.filter((item) => item.status === "connected").map((item) => ({ id: item.id, provider: item.provider, status: item.status, display_name: item.provider === "aws" ? DEMO_AWS.displayName : DEMO_GENESYS_NAME, last_sync_at: item.lastSyncAt })),
        entities: DEMO_AUDIT_EVENTS.map((item) => ({ provider: item.entityType === "vulnerability" || item.entityType === "agent" ? "aws" : "genesys", connection_id: item.entityId, entity_type: item.entityType, entity_key: item.entityId, payload: { action: item.action, detail: item.detail }, observed_at: item.createdAt })),
        runs: DEMO_INTEGRATIONS.map((item) => ({ provider: item.provider, connection_id: item.id, status: item.lastSyncStatus, started_at: item.lastSyncAt, finished_at: item.lastSyncAt, records_seen: item.provider === "aws" ? DEMO_AWS.resources : DEMO_GENESYS.users, error_message: null })),
        department: { key: null, name: "All departments", unrestricted: true },
      },
      fetchedAt: new Date().toISOString(),
    };
  }
  const [genesys, providers] = await Promise.all([loadLiveWorkspaceData(context.supabase, context.userId), loadProviderReportData(context.supabase, context.userId)]);
  return { genesys, providers, fetchedAt: new Date().toISOString() };
});

const DEMO_GENESYS_NAME = "Acme Customer Care";
void DEMO_CHANGES;