import { IntegrationError } from "./errors";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Reconcile provider records after a successful full sync. A provider record
 * absent from the latest successful snapshot must not remain visible in Aegis.
 * This is intentionally separate from the upsert code so partial/failed syncs
 * never trigger destructive reconciliation.
 */
export async function reconcileGenesysSnapshot(
  integrationId: string,
  lastSuccessfulSyncAt: string,
) {
  const db = await admin();
  const cutoff = new Date(lastSuccessfulSyncAt).toISOString();

  const tables = ["genesys_users", "genesys_licenses", "genesys_queues"] as const;
  const deleted: Record<string, number> = {};

  for (const table of tables) {
    const { data, error } = await db
      .from(table)
      .delete()
      .eq("integration_id", integrationId)
      .lt("synced_at", cutoff)
      .select("id");

    if (error) {
      throw new IntegrationError("provider_error", `Failed to reconcile stale ${table}: ${error.message}`);
    }
    deleted[table] = data?.length ?? 0;
  }

  // User-license relationships are also reconciled here. runSync already
  // handles them, but repeating the invariant makes the operation safe if a
  // future sync implementation changes.
  const { data: staleAssignments, error: assignmentError } = await db
    .from("genesys_user_licenses")
    .delete()
    .eq("integration_id", integrationId)
    .lt("synced_at", cutoff)
    .select("id");

  if (assignmentError) {
    throw new IntegrationError("provider_error", `Failed to reconcile stale license assignments: ${assignmentError.message}`);
  }
  deleted.genesys_user_licenses = staleAssignments?.length ?? 0;

  return deleted;
}
