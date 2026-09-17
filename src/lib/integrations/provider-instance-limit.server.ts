import type { SupabaseClient } from "@supabase/supabase-js";

export const MAX_PROVIDER_INSTANCES = 5;
export const MAX_PROVIDER_INSTANCES_ERROR = "Maximum of 5 instances allowed for this provider in this workspace.";

type AdminClient = SupabaseClient<any, "public", any>;

export async function assertProviderInstanceCapacity(db: AdminClient, tenantId: string, provider: string, connectionId?: string) {
  if (connectionId) {
    const { data: existing, error } = await db.from("provider_connections").select("id").eq("id", connectionId).eq("tenant_id", tenantId).eq("provider", provider).maybeSingle();
    if (error) throw new Error(error.message);
    if (existing) return;
    throw new Error("The requested integration instance was not found for this workspace.");
  }
  const { count, error } = await db.from("provider_connections").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("provider", provider);
  if (error) throw new Error(error.message);
  if ((count ?? 0) >= MAX_PROVIDER_INSTANCES) throw new Error(MAX_PROVIDER_INSTANCES_ERROR);
}

export async function assertDedicatedProviderInstanceCapacity(db: AdminClient, tenantId: string, provider: string, connectionId?: string) {
  if (connectionId) {
    const { data: existing, error } = await db.from("integrations").select("id").eq("id", connectionId).eq("tenant_id", tenantId).eq("provider", provider).maybeSingle();
    if (error) throw new Error(error.message);
    if (existing) return;
    throw new Error("The requested integration instance was not found for this workspace.");
  }
  const { count, error } = await db.from("integrations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("provider", provider);
  if (error) throw new Error(error.message);
  if ((count ?? 0) >= MAX_PROVIDER_INSTANCES) throw new Error(MAX_PROVIDER_INSTANCES_ERROR);
}
