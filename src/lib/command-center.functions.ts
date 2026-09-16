import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadCommandCenterData } from "@/lib/command-center.server";
import { resolveTenantContext } from "@/lib/tenant-context.server";
import { recordOperationalIssueSafely } from "@/lib/operational-issues.server";
import { toSharedFinding, type SharedFinding } from "@/lib/evidence/finding";
import type { CommandCenterData } from "@/lib/command-center.server";

export type { CommandCenterChange, CommandCenterSignal } from "@/lib/command-center.server";
export type CommandCenterDataWithFindings = CommandCenterData & { findings: SharedFinding[] };

function sharedFindings(data: CommandCenterData): SharedFinding[] {
  const findings: SharedFinding[] = [];
  const changeRefs = (predicate: (change: CommandCenterData["changed"][number]) => boolean) => data.changed.filter(predicate).map((change) => `change:${change.changeId}`);
  const signalRefs = (predicate: (signal: CommandCenterData["signals"][number]) => boolean) => data.signals.filter(predicate).map((signal) => `audit:${signal.id}`);
  const add = (input: Omit<SharedFinding, "evidenceRefs">, refs: string[]) => { if (refs.length) findings.push(toSharedFinding({ ...input, evidenceRefs: refs })); };

  add({ id: "pending-changes", title: "Changes awaiting review", severity: "high", category: "Change risk", impact: "Governed action", confidence: 0.98, href: "/approvals", freshness: data.generatedAt }, changeRefs((change) => ["Team Approvals", "Risk Review"].includes(change.stage)));
  add({ id: "proposed-changes", title: "Proposed optimization changes", severity: "medium", category: "Optimization", impact: "AI operations", confidence: 0.95, href: "/approvals", freshness: data.generatedAt }, changeRefs((change) => change.stage === "Proposed"));
  add({ id: "guardrail-blocks", title: "Guardrail evaluations requiring attention", severity: "critical", category: "Governance", impact: "AI agents", confidence: 0.98, href: "/governance", freshness: data.generatedAt }, signalRefs((signal) => signal.action.startsWith("guardrail.")));
  add({ id: "integration-health", title: "Integration health needs attention", severity: "high", category: "Availability", impact: "Integrations", confidence: 0.99, href: "/integrations", freshness: data.generatedAt }, data.posture.integrations.filter((integration) => integration.status !== "connected" || integration.healthStatus === "unhealthy").map((integration) => `integration:${integration.id}`));
  return findings;
}

const emptyCommandCenterData = (): CommandCenterDataWithFindings => {
  const generatedAt = new Date().toISOString();
  return {
    live: { connected: false, provider: null, orgName: null, region: null, lastSyncAt: null, healthStatus: null, users: 0, activeUsers: 0, licensedUsers: 0, licenseAssignments: 0, licenseTypes: 0, queues: 0, emptyQueues: 0, multipleLicenseUsers: 0, inactiveLicensedUsers: 0, recommendations: [], fetchedAt: generatedAt, readOnly: true },
    attention: { pendingChanges: 0, proposedChanges: 0, blockingGuardrailEvaluations: 0, integrationsNeedingAttention: 0, unreadNotifications: 0 },
    changed: [], risk: { bySeverity: {}, criticalOrHighOpen: 0, guardrailsEnabled: 0, guardrailsMonitoringOnly: 0 },
    posture: { integrations: [], agentsWithRealBindings: 0, agentsConfigured: 0, lastSyncRunAt: null, lastSyncRunStatus: null }, signals: [], generatedAt, findings: [],
  };
};

export const getCommandCenterData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CommandCenterDataWithFindings> => {
    try {
      const data = await loadCommandCenterData(context.supabase, context.userId);
      return { ...data, findings: sharedFindings(data) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        const tenant = await resolveTenantContext(context.supabase, context.userId);
        if (tenant.environmentMode === "live") await recordOperationalIssueSafely(context.supabase, { tenantId: tenant.tenantId, source: "command_center", severity: "warning", title: "Command Center data unavailable", message });
      } catch {
        // Fail soft: Command Center must remain usable even if issue recording fails.
      }
      console.error("[command-center] failed to load live data", error);
      return emptyCommandCenterData();
    }
  });
