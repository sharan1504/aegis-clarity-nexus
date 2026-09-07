import { resolveTenant } from "@/lib/genesys/store.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DEMO_AUDIT_EVENTS, DEMO_CHANGES, DEMO_GENESYS, DEMO_INTEGRATIONS, DEMO_AWS } from "@/lib/demo-data";
import { resolveTenantContext } from "@/lib/tenant-context.server";

export type UserClientLike = SupabaseClient<Database>;
export interface CommandCenterChange { id: string; changeId: string; title: string; stage: string; severity: string; ownerTeam: string; createdAt: string; updatedAt: string; }
export interface CommandCenterSignal { id: string; action: string; entityType: string; entityId: string | null; detail: string | null; actor: string | null; createdAt: string; }
export interface CommandCenterData {
  live: { connected: boolean; provider: string | null; orgName: string | null; region: string | null; lastSyncAt: string | null; healthStatus: string | null; users: number; activeUsers: number; licensedUsers: number; licenseAssignments: number; licenseTypes: number; queues: number; emptyQueues: number; multipleLicenseUsers: number; inactiveLicensedUsers: number; recommendations: never[]; fetchedAt: string; readOnly: boolean };
  attention: { pendingChanges: number; proposedChanges: number; blockingGuardrailEvaluations: number; integrationsNeedingAttention: number; unreadNotifications: number };
  changed: CommandCenterChange[];
  risk: { bySeverity: Record<string, number>; criticalOrHighOpen: number; guardrailsEnabled: number; guardrailsMonitoringOnly: number };
  posture: { integrations: Array<{ id: string; provider: string; status: string; healthStatus: string; lastSyncAt: string | null; lastSyncStatus: string | null; isMock: boolean }>; agentsWithRealBindings: number; agentsConfigured: number; lastSyncRunAt: string | null; lastSyncRunStatus: string | null };
  signals: CommandCenterSignal[]; generatedAt: string;
}
const OPEN_STAGES = ["Proposed", "Team Approvals", "Risk Review", "Scheduled"];

function buildDemoCommandCenterData(): CommandCenterData {
  const generatedAt = new Date().toISOString();
  const changeRows = DEMO_CHANGES.map((row) => ({ id: row.id, change_id: row.changeId, title: row.title, stage: row.stage, severity: row.severity, owner_team: row.ownerTeam, created_at: row.createdAt, updated_at: row.updatedAt }));
  const integrationRows = DEMO_INTEGRATIONS.map((row) => ({ id: row.id, provider: row.provider, status: row.status, health_status: row.healthStatus, last_sync_at: row.lastSyncAt as string | null, last_sync_status: row.lastSyncStatus as string | null, is_mock: row.isMock, external_org_name: null as string | null, region: null as string | null, updated_at: row.lastSyncAt as string }));
  const signalRows = DEMO_AUDIT_EVENTS.map((row) => ({ id: row.id, action: row.action, entity_type: row.entityType, entity_id: row.entityId as string | null, detail: row.detail as string | null, actor_email: row.actor as string | null, created_at: row.createdAt }));
  const bySeverity: Record<string, number> = {};
  for (const row of changeRows) { const key = String(row.severity ?? "unspecified").toLowerCase(); bySeverity[key] = (bySeverity[key] ?? 0) + 1; }
  const openRows = changeRows.filter((row) => OPEN_STAGES.includes(String(row.stage)));
  return {
    live: { connected: true, provider: DEMO_GENESYS.provider, orgName: DEMO_GENESYS.orgName, region: DEMO_GENESYS.region, lastSyncAt: DEMO_GENESYS.lastSyncAt, healthStatus: DEMO_GENESYS.healthStatus, users: DEMO_GENESYS.users, activeUsers: DEMO_GENESYS.activeUsers, licensedUsers: DEMO_GENESYS.licensedUsers, licenseAssignments: DEMO_GENESYS.licenseAssignments, licenseTypes: DEMO_GENESYS.licenseTypes, queues: DEMO_GENESYS.queues, emptyQueues: DEMO_GENESYS.emptyQueues, multipleLicenseUsers: DEMO_GENESYS.multipleLicenseUsers, inactiveLicensedUsers: DEMO_GENESYS.inactiveLicensedUsers, recommendations: [], fetchedAt: generatedAt, readOnly: true },
    attention: { pendingChanges: changeRows.filter((row) => String(row.stage) === "Team Approvals" || String(row.stage) === "Risk Review").length, proposedChanges: changeRows.filter((row) => String(row.stage) === "Proposed").length, blockingGuardrailEvaluations: 2, integrationsNeedingAttention: 0, unreadNotifications: 3 },
    changed: changeRows.slice(0, 8).map((row) => ({ id: String(row.id), changeId: String(row.change_id), title: String(row.title), stage: String(row.stage), severity: String(row.severity ?? "unspecified"), ownerTeam: String(row.owner_team ?? "Unassigned"), createdAt: String(row.created_at), updatedAt: String(row.updated_at ?? row.created_at) })),
    risk: { bySeverity, criticalOrHighOpen: openRows.filter((row) => ["critical", "high"].includes(String(row.severity ?? "").toLowerCase())).length, guardrailsEnabled: 8, guardrailsMonitoringOnly: 3 },
    posture: { integrations: integrationRows.map((row) => ({ id: String(row.id), provider: String(row.provider), status: String(row.status), healthStatus: String(row.health_status ?? "healthy"), lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : null, lastSyncStatus: row.last_sync_status ? String(row.last_sync_status) : null, isMock: Boolean(row.is_mock) })), agentsWithRealBindings: 0, agentsConfigured: 5, lastSyncRunAt: DEMO_GENESYS.lastSyncAt, lastSyncRunStatus: "success" },
    signals: signalRows.map((row) => ({ id: String(row.id), action: String(row.action), entityType: String(row.entity_type), entityId: row.entity_id ? String(row.entity_id) : null, detail: row.detail ? String(row.detail) : null, actor: row.actor_email ? String(row.actor_email) : null, createdAt: String(row.created_at) })), generatedAt,
  };
}

export async function loadCommandCenterData(supabase: UserClientLike, userId: string): Promise<CommandCenterData> {
  const { tenantId, environmentMode } = await resolveTenantContext(supabase, userId); const usingDemo = environmentMode === "demo";
  if (usingDemo) return buildDemoCommandCenterData();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [changes, guardrails, guardrailEvaluations, integrations, bindings, syncRuns, notifications, auditRows, genesysUsers, genesysLicenses, genesysUserLicenses, genesysQueues] = await Promise.all([
    supabase.from("change_records").select("id,change_id,title,stage,severity,owner_team,created_at,updated_at").eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(200),
    supabase.from("guardrails").select("id,enabled,enforcement_mode").or(`tenant_id.eq.${tenantId},tenant_id.is.null`),
    supabase.from("guardrail_evaluations").select("id,decision,created_at").eq("tenant_id", tenantId).gte("created_at", since).limit(1000),
    supabase.from("integrations").select("id,provider,status,health_status,last_sync_at,last_sync_status,is_mock,external_org_name,region,updated_at").eq("tenant_id", tenantId).order("updated_at", { ascending: false }),
    supabase.from("agent_integration_bindings").select("agent_key,enabled,is_mock").eq("tenant_id", tenantId),
    supabase.from("integration_sync_runs").select("started_at,finished_at,status").eq("tenant_id", tenantId).order("started_at", { ascending: false }).limit(1),
    supabase.from("notifications").select("id,unread").eq("tenant_id", tenantId).eq("unread", true).limit(200),
    supabase.from("audit_log").select("id,action,entity_type,entity_id,detail,actor_email,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(25),
    supabase.from("genesys_users").select("id,state", { count: "exact" }).eq("tenant_id", tenantId),
    supabase.from("genesys_licenses").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase.from("genesys_user_licenses").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase.from("genesys_queues").select("id,member_count", { count: "exact" }).eq("tenant_id", tenantId),
  ]);
  const changeRows = changes.data ?? [];
  const integrationRows = integrations.data ?? [];
  const signalRows = auditRows.data ?? [];
  const bySeverity: Record<string, number> = {};
  for (const row of changeRows) { const key = String(row.severity ?? "unspecified").toLowerCase(); bySeverity[key] = (bySeverity[key] ?? 0) + 1; }
  const openRows = changeRows.filter((row) => OPEN_STAGES.includes(String(row.stage))); const selectedIntegration = integrationRows.find((row) => row.status === "connected") ?? integrationRows[0] ?? null;
  const bindingRows = bindings.data ?? []; const configuredAgents = new Set(bindingRows.map((row) => String(row.agent_key))).size; const realBindingAgents = new Set(bindingRows.filter((row) => row.enabled && !row.is_mock).map((row) => String(row.agent_key)));
  const syncRun = (syncRuns.data ?? [])[0] ?? null; const userRows = genesysUsers.data ?? []; const queueRows = genesysQueues.data ?? []; const genesysSelected = selectedIntegration?.provider === "genesys";
  const users = genesysSelected ? (genesysUsers.count ?? userRows.length) : 0; const activeUsers = genesysSelected ? userRows.filter((row) => String(row.state ?? "").toLowerCase() === "active").length : 0;
  const queues = genesysSelected ? (genesysQueues.count ?? queueRows.length) : 0; const emptyQueues = genesysSelected ? queueRows.filter((row) => Number(row.member_count ?? 0) === 0).length : 0;
  return {
    live: { connected: Boolean(selectedIntegration?.status === "connected"), provider: selectedIntegration ? String(selectedIntegration.provider) : null, orgName: selectedIntegration?.external_org_name ? String(selectedIntegration.external_org_name) : null, region: selectedIntegration?.region ? String(selectedIntegration.region) : null, lastSyncAt: selectedIntegration?.last_sync_at ? String(selectedIntegration.last_sync_at) : null, healthStatus: selectedIntegration?.health_status ? String(selectedIntegration.health_status) : null, users, activeUsers, licensedUsers: genesysSelected ? 0 : 0, licenseAssignments: genesysSelected ? (genesysUserLicenses.count ?? 0) : 0, licenseTypes: genesysSelected ? (genesysLicenses.count ?? 0) : 0, queues, emptyQueues, multipleLicenseUsers: 0, inactiveLicensedUsers: 0, recommendations: [], fetchedAt: new Date().toISOString(), readOnly: true },
    attention: { pendingChanges: changeRows.filter((row) => String(row.stage) === "Team Approvals" || String(row.stage) === "Risk Review").length, proposedChanges: changeRows.filter((row) => String(row.stage) === "Proposed").length, blockingGuardrailEvaluations: (guardrailEvaluations.data ?? []).filter((row) => String(row.decision) !== "allow").length, integrationsNeedingAttention: integrationRows.filter((row) => String(row.status) !== "connected" || String(row.health_status) === "unhealthy").length, unreadNotifications: (notifications.data ?? []).length },
    changed: changeRows.slice(0, 8).map((row) => ({ id: String(row.id), changeId: String(row.change_id), title: String(row.title), stage: String(row.stage), severity: String(row.severity ?? "unspecified"), ownerTeam: String(row.owner_team ?? "Unassigned"), createdAt: String(row.created_at), updatedAt: String(row.updated_at ?? row.created_at) })),
    risk: { bySeverity, criticalOrHighOpen: openRows.filter((row) => ["critical", "high"].includes(String(row.severity ?? "").toLowerCase())).length, guardrailsEnabled: (guardrails.data ?? []).filter((row) => row.enabled && String(row.enforcement_mode) === "enforce").length, guardrailsMonitoringOnly: (guardrails.data ?? []).filter((row) => row.enabled && String(row.enforcement_mode) === "monitor").length },
    posture: { integrations: integrationRows.map((row) => ({ id: String(row.id), provider: String(row.provider), status: String(row.status), healthStatus: String(row.health_status ?? "healthy"), lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : null, lastSyncStatus: row.last_sync_status ? String(row.last_sync_status) : null, isMock: Boolean(row.is_mock) })), agentsWithRealBindings: realBindingAgents.size, agentsConfigured: configuredAgents, lastSyncRunAt: syncRun ? String(syncRun.finished_at ?? syncRun.started_at) : null, lastSyncRunStatus: syncRun ? String(syncRun.status) : null },
    signals: signalRows.map((row) => ({ id: String(row.id), action: String(row.action), entityType: String(row.entity_type), entityId: row.entity_id ? String(row.entity_id) : null, detail: row.detail ? String(row.detail) : null, actor: row.actor_email ? String(row.actor_email) : null, createdAt: String(row.created_at) })), generatedAt: new Date().toISOString(),
  };
}
