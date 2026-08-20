// Server-only synchronization primitives for the License Agent.
// The scheduler should invoke this job periodically (recommended: every 15 minutes).
// Supabase remains the source of truth; this module is deliberately read-only with
// respect to provider data and never exposes provider credentials to the chat model.
import { capabilityRouter } from "@/lib/capabilities/router.server";
import { authorizeCapabilityAccess } from "@/lib/capabilities/authorization.server";
import { LICENSE_AGENT_KEY } from "./types";

export interface LicenseSyncResult {
  ok: boolean;
  syncedAt: string;
  dataVersion: string;
  recordCount: number;
  freshness: unknown;
  sources: unknown[];
  warnings: string[];
  error?: string;
}

/**
 * Pull the latest authorized license inventory and establish a versioned
 * snapshot marker. The existing capability router remains the only path to
 * customer license data, so authorization and guardrails are preserved.
 *
 * A later Redis adapter can use `dataVersion` as the cache namespace. We do
 * not cache provider data in-process because server instances may scale out.
 */
export async function syncLicenseSnapshot(
  supabase: Parameters<typeof capabilityRouter.getLicenseInventory>[0],
  userId: string,
): Promise<LicenseSyncResult> {
  const syncedAt = new Date().toISOString();
  try {
    const access = await authorizeCapabilityAccess(
      supabase,
      userId,
      LICENSE_AGENT_KEY,
      "license_inventory",
    );
    if (!access.ok) {
      return {
        ok: false,
        syncedAt,
        dataVersion: "",
        recordCount: 0,
        freshness: "unavailable",
        sources: [],
        warnings: [access.denied?.message ?? "License inventory access is not authorized."],
        error: "license_inventory_not_authorized",
      };
    }

    const inventory = await capabilityRouter.getLicenseInventory(
      supabase,
      userId,
      LICENSE_AGENT_KEY,
      { now: Date.now() },
    );

    if (inventory.denied) {
      return {
        ok: false,
        syncedAt,
        dataVersion: "",
        recordCount: 0,
        freshness: inventory.freshness,
        sources: inventory.sources,
        warnings: inventory.warnings,
        error: inventory.denied.message,
      };
    }

    // Snapshot identity is based on the successful source freshness plus the
    // sync timestamp. Persist this marker with the snapshot/cache metadata in
    // the scheduler implementation; do not use a fixed TTL as the freshness
    // contract.
    const dataVersion = `${inventory.sources.map((s) => s.integrationId).sort().join(",")}:${inventory.freshness}:${syncedAt}`;

    return {
      ok: true,
      syncedAt,
      dataVersion,
      recordCount: inventory.records.length,
      freshness: inventory.freshness,
      sources: inventory.sources,
      warnings: inventory.warnings,
    };
  } catch (error) {
    return {
      ok: false,
      syncedAt,
      dataVersion: "",
      recordCount: 0,
      freshness: "unavailable",
      sources: [],
      warnings: [],
      error: error instanceof Error ? error.message : "License synchronization failed.",
    };
  }
}
