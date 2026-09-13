import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadCommandCenterData } from "@/lib/command-center.server";
import { resolveTenantContext } from "@/lib/tenant-context.server";
import { recordOperationalIssueSafely } from "@/lib/operational-issues.server";
import type { CommandCenterData } from "@/lib/command-center.server";

export type { CommandCenterChange, CommandCenterSignal } from "@/lib/command-center.server";

const emptyCommandCenterData = (): CommandCenterData => {
  const generatedAt = new Date().toISOString();
  return {
    live: { connected: false, provider: null, orgName: null, region: null, lastSyncAt: null, healthStatus: null, users: 0, activeUsers: 0, licensedUsers: 0, licenseAssignments: 0, licenseTypes: 0, queues: 0, emptyQueues: 0, multipleLicenseUsers: 0, inactiveLicensedUsers: 0, recommendations: [], fetchedAt: generatedAt, readOnly: true },
    attention: { pendingChanges: 0, proposedChanges: 0, blockingGuardrailEvaluations: 0, integrationsNeedingAttention: 0, unreadNotifications: 0 },
    changed: [], risk: { bySeverity: {}, criticalOrHighOpen: 0, guardrailsEnabled: 0, guardrailsMonitoringOnly: 0 },
    posture: { integrations: [], agentsWithRealBindings: 0, agentsConfigured: 0, lastSyncRunAt: null, lastSyncRunStatus: null }, signals: [], generatedAt,
  };
};

export const getCommandCenterData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try { return await loadCommandCenterData(context.supabase, context.userId); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        const tenant = await resolveTenantContext(context.supabase, context.userId);
        if (tenant.environmentMode === "live") await recordOperationalIssueSafely(context.supabase, { tenantId: tenant.tenantId, source: "command_center", severity: "high", title: "Command Center data load failed", detail: `The Command Center could not load its live operational data. ${message}`, fingerprint: `command-center-load:${message}` });
      } catch (captureError) { console.error("[command-center] operational issue capture failed", captureError); }
      console.error("[command-center] returning empty live workspace state after data-load failure", error);
      return emptyCommandCenterData();
    }
  });
