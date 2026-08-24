import { resolveTenant } from "@/lib/genesys/store.server";
import { loadLiveWorkspaceData, type LiveWorkspaceData } from "@/lib/live-workspace.functions";

export type UserClientLike = Parameters<typeof resolveTenant>[0];

export interface CommandCenterChange { id: string; changeId: string; title: string; stage: string; severity: string; ownerTeam: string; createdAt: string; updatedAt: string; }
export interface CommandCenterSignal { id: string; action: string; entityType: string; entityId: string | null; detail: string | null; actor: string | null; createdAt: string; }
export interface CommandCenterData {
  live: LiveWorkspaceData;
  attention: { pendingChanges: number; proposedChanges: number; blockingGuardrailEvaluations: number; integrationsNeedingAttention: number; unreadNotifications: number };
  changed: CommandCenterChange[];
  risk: { bySeverity: Record<string, number>; criticalOrHighOpen: number; guardrailsEnabled: number; guardrailsMonitoringOnly: number };
  posture: { integrations: Array<{ id: string; provider: string; status: string; healthStatus: string; lastSyncAt: string | null; lastSyncStatus: string | null; isMock: boolean }>; agentsWithRealBindings: number; agentsConfigured: number; lastSyncRunAt: string | null; lastSyncRunStatus: string | null };
  signals: CommandCenterSignal[];
  generatedAt: string;
}

const OPEN_STAGES = ["Proposed", "Team Approvals", "Risk Review", "Scheduled"];

export async function loadCommandCenterData(supabase: UserClientLike, userId: string): Promise<CommandCenterData> {
  const { tenantId } = await resolveTenant(supabase, userId);
  const db = supabase as any;
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [live, changes, guardrails, guardrailEvaluations, integrations, agents, bindings, syncRuns, notifications, auditRows] = await Promise.all([
    loadLiveWorkspaceData(supabase, userId),
    db.from("change_records").select("id,change_id,title,stage,severity,owner_team,created_at,updated_at").eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(200),
    db.from("guardrails").select("id,enabled,enforcement_mode").or(`tenant_id.eq.${tenantId},tenant_id.is.null`),
    db.from("guardrail_evaluations").select("id,decision,created_at").eq("tenant_id", tenantId).gte("created_at", since).limit(1000),
    db.from("integrations").select("id,provider,status,health_status,last_sync_at,last_sync_status,is_mock").eq("tenant_id", tenantId),
    db.from("agent_definitions").select("agent_key"),
    db.from("agent_integration_bindings").select("agent_key,enabled,is_mock").eq("tenant_id", tenantId),
    db.from("integration_sync_runs").select("started_at,finished_at,status").eq("tenant_id", tenantId).order("started_at", { ascending: false }).limit(1),
    db.from("notifications").select("id,unread").eq("tenant_id", tenantId).eq("unread", true).limit(200),
    db.from("audit_log").select("id,action,entity_type,entity_id,detail,actor_email,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(25),
  ]);
  const changeRows: any[] = changes.data ?? [];
  const bySeverity: Record<string, number> = {};
  for (const row of changeRows) { const key = String(row.severity ?? "unspecified").toLowerCase(); bySeverity[key] = (bySeverity[key] ?? 0) + 1; }
  const openRows = changeRows.filter((row) => OPEN_STAGES.includes(String(row.stage)));
  const guardrailRows: any[] = guardrails.data ?? [];
  const bindingRows: any[] = bindings.data ?? [];
  const realBindingAgents = new Set(bindingRows.filter((row) => row.enabled && !row.is_mock).map((row) => String(row.agent_key)));
  const integrationRows: any[] = integrations.data ?? [];
  const syncRun: any = (syncRuns.data ?? [])[0] ?? null;
  return {
    live,
    attention: {
      pendingChanges: changeRows.filter((row) => String(row.stage) === "Team Approvals" || String(row.stage) === "Risk Review").length,
      proposedChanges: changeRows.filter((row) => String(row.stage) === "Proposed").length,
      blockingGuardrailEvaluations: (guardrailEvaluations.data ?? []).filter((row: any) => String(row.decision) !== "allow").length,
      integrationsNeedingAttention: integrationRows.filter((row) => String(row.status) !== "connected" || String(row.health_status) === "unhealthy").length,
      unreadNotifications: (notifications.data ?? []).length,
    },
    changed: changeRows.slice(0, 8).map((row) => ({ id: String(row.id), changeId: String(row.change_id), title: String(row.title), stage: String(row.stage), severity: String(row.severity ?? "unspecified"), ownerTeam: String(row.owner_team ?? "Unassigned"), createdAt: String(row.created_at), updatedAt: String(row.updated_at ?? row.created_at) })),
    risk: {
      bySeverity,
      criticalOrHighOpen: openRows.filter((row) => ["critical", "high"].includes(String(row.severity ?? "").toLowerCase())).length,
      guardrailsEnabled: guardrailRows.filter((row) => row.enabled && String(row.enforcement_mode) === "enforce").length,
      guardrailsMonitoringOnly: guardrailRows.filter((row) => row.enabled && String(row.enforcement_mode) === "monitor").length,
    },
    posture: {
      integrations: integrationRows.map((row) => ({ id: String(row.id), provider: String(row.provider), status: String(row.status), healthStatus: String(row.health_status ?? "unknown"), lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : null, lastSyncStatus: row.last_sync_status ? String(row.last_sync_status) : null, isMock: Boolean(row.is_mock) })),
      agentsWithRealBindings: realBindingAgents.size,
      agentsConfigured: (agents.data ?? []).length,
      lastSyncRunAt: syncRun ? String(syncRun.finished_at ?? syncRun.started_at) : null,
      lastSyncRunStatus: syncRun ? String(syncRun.status) : null,
    },
    signals: (auditRows.data ?? []).map((row: any) => ({ id: String(row.id), action: String(row.action), entityType: String(row.entity_type), entityId: row.entity_id ? String(row.entity_id) : null, detail: row.detail ? String(row.detail) : null, actor: row.actor_email ? String(row.actor_email) : null, createdAt: String(row.created_at) })),
    generatedAt: new Date().toISOString(),
  };
}
