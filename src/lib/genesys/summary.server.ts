import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { IntegrationSummary } from "./store.server";

export async function getGenesysIntegrationSummary(tenantId: string, fallback: IntegrationSummary | null): Promise<IntegrationSummary | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as SupabaseClient<Database>;
  const { data, error } = await db
    .from("integrations")
    .select("id, provider, status, health_status, health_detail, region, external_org_id, external_org_name, scopes, last_sync_at, last_sync_status, last_sync_error, connected_at")
    .eq("tenant_id", tenantId)
    .eq("provider", "genesys")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return fallback;

  const [users, licenses, userLicenses, queues] = await Promise.all([
    db.from("genesys_users").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("integration_id", data.id),
    db.from("genesys_licenses").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("integration_id", data.id),
    db.from("genesys_user_licenses").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("integration_id", data.id),
    db.from("genesys_queues").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("integration_id", data.id),
  ]);

  return {
    id: data.id,
    provider: data.provider,
    status: data.status,
    healthStatus: data.health_status,
    healthDetail: data.health_detail,
    region: data.region,
    externalOrgId: data.external_org_id,
    externalOrgName: data.external_org_name,
    scopes: data.scopes ?? [],
    lastSyncAt: data.last_sync_at,
    lastSyncStatus: data.last_sync_status,
    lastSyncError: data.last_sync_error,
    connectedAt: data.connected_at,
    counts: {
      users: users.count ?? 0,
      licenses: licenses.count ?? 0,
      userLicenses: userLicenses.count ?? 0,
      queues: queues.count ?? 0,
    },
  };
}
