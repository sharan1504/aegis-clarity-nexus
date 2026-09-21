import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DEMO_AUDIT_EVENTS, DEMO_CHANGES, DEMO_COMMAND_CENTER, DEMO_GENESYS, DEMO_INTEGRATIONS, DEMO_NOW } from "@/lib/demo-data";
import { resolveTenantContext } from "@/lib/tenant-context.server";

export type UserClientLike = SupabaseClient<Database>;
export interface CommandCenterChange { id: string; changeId: string; title: string; stage: string; severity: string; ownerTeam: string; createdAt: string; updatedAt: string; }
export interface CommandCenterSignal { id: string; action: string; entityType: string; entityId: string | null; detail: string | null; actor: string | null; createdAt: string; }
export interface CommandCenterKpis {
  integrationsTotal: number; integrationsConnected: number; integrationsDegraded: number;
  pendingApprovals: number; proposedChanges: number; openHighChanges: number;
  guardrailBlocks24h: number; syncFailures24h: number; unreadNotifications: number;
  agentsConfigured: number; agentsWithRealBindings: number;
}
export interface CommandCenterTrends { days: string[]; syncSuccess: number[]; syncFailed: number[]; guardrailBlocks: number[]; auditEvents: number[]; }
export interface CommandCenterGenesys {
  connected: true; orgName: string | null; region: string | null; lastSyncAt: string | null; healthStatus: string | null;
  users: number; activeUsers: number; queues: number; emptyQueues: number; licenseTypes: number;
  licenseAssignments: number; licensedUsers: number; multipleLicenseUsers: number; inactiveLicensedUsers: number;
}
export interface CommandCenterData {
  live: { connected: boolean; provider: string | null; orgName: string | null; region: string | null; lastSyncAt: string | null; healthStatus: string | null; users: number; activeUsers: number; licensedUsers: number; licenseAssignments: number; licenseTypes: number; queues: number; emptyQueues: number; multipleLicenseUsers: number; inactiveLicensedUsers: number; recommendations: never[]; fetchedAt: string; readOnly: boolean };
  kpis: CommandCenterKpis;
  trends: CommandCenterTrends;
  genesys: CommandCenterGenesys | null;
  attention: { pendingChanges: number; proposedChanges: number; blockingGuardrailEvaluations: number; integrationsNeedingAttention: number; unreadNotifications: number };
  changed: CommandCenterChange[];
  risk: { bySeverity: Record<string, number>; criticalOrHighOpen: number; guardrailsEnabled: number; guardrailsMonitoringOnly: number };
  posture: { integrations: Array<{ id: string; provider: string; status: string; healthStatus: string; lastSyncAt: string | null; lastSyncStatus: string | null; isMock: boolean }>; agentsWithRealBindings: number; agentsConfigured: number; lastSyncRunAt: string | null; lastSyncRunStatus: string | null };
  signals: CommandCenterSignal[]; generatedAt: string;
}
const OPEN_STAGES = ["Proposed", "Team Approvals", "Risk Review", "Scheduled"];
const SUCCESS_SYNC_STATUSES = new Set(["success", "succeeded", "completed", "complete"]);
const FAILED_SYNC_STATUSES = new Set(["failed", "failure", "error"]);
const BLOCKING_DECISIONS = new Set(["block", "blocked", "deny", "denied", "require_approval", "approval_required"]);

function emptyKpis(): CommandCenterKpis {
  return { integrationsTotal: 0, integrationsConnected: 0, integrationsDegraded: 0, pendingApprovals: 0, proposedChanges: 0, openHighChanges: 0, guardrailBlocks24h: 0, syncFailures24h: 0, unreadNotifications: 0, agentsConfigured: 0, agentsWithRealBindings: 0 };
}
function emptyTrends(): CommandCenterTrends { return { days: [], syncSuccess: [], syncFailed: [], guardrailBlocks: [], auditEvents: [] }; }
function emptyGenesys(): CommandCenterGenesys | null { return null; }
function dayKey(value: string): string { return new Date(value).toISOString().slice(0, 10); }
function lastSevenDays(now = new Date()): string[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (6 - index)));
    return date.toISOString().slice(0, 10);
  });
}
function buildTrends(days: string[], syncRows: Array<{ started_at: string; finished_at?: string | null; status: string }>, guardrailRows: Array<{ created_at: string; decision: string }>, auditRows: Array<{ created_at: string }>): CommandCenterTrends {
  const indexes = new Map(days.map((day, index) => [day, index]));
  const syncSuccess = Array(7).fill(0); const syncFailed = Array(7).fill(0); const guardrailBlocks = Array(7).fill(0); const auditEvents = Array(7).fill(0);
  for (const row of syncRows) { const index = indexes.get(dayKey(row.started_at)); if (index === undefined) continue; const status = String(row.status).toLowerCase(); if (SUCCESS_SYNC_STATUSES.has(status)) syncSuccess[index] += 1; else if (FAILED_SYNC_STATUSES.has(status)) syncFailed[index] += 1; }
  for (const row of guardrailRows) { const index = indexes.get(dayKey(row.created_at)); if (index !== undefined && BLOCKING_DECISIONS.has(String(row.decision).toLowerCase())) guardrailBlocks[index] += 1; }
  for (const row of auditRows) { const index = indexes.get(dayKey(row.created_at)); if (index !== undefined) auditEvents[index] += 1; }
  return { days, syncSuccess, syncFailed, guardrailBlocks, auditEvents };
}

function buildDemoCommandCenterData(): CommandCenterData {
  const generatedAt = new Date().toISOString();
  const changeRows = DEMO_CHANGES.map((row) => ({ id: row.id, change_id: row.changeId, title: row.title, stage: row.stage, severity: row.severity, owner_team: row.ownerTeam, created_at: row.createdAt, updated_at: row.updatedAt }));
  const integrationRows = DEMO_INTEGRATIONS.map((row) => ({ id: row.id, provider: row.provider, status: row.status, health_status: row.healthStatus, last_sync_at: row.lastSyncAt as string | null, last_sync_status: row.lastSyncStatus as string | null, is_mock: row.isMock }));
  const signalRows = DEMO_AUDIT_EVENTS.map((row) => ({ id: row.id, action: row.action, entity_type: row.entityType, entity_id: row.entityId as string | null, detail: row.detail as string | null, actor_email: row.actor as string | null, created_at: row.createdAt }));
  const bySeverity: Record<string, number> = {};
  for (const row of changeRows) { const key = String(row.severity ?? "unspecified").toLowerCase(); bySeverity[key] = (bySeverity[key] ?? 0) + 1; }
  const openRows = changeRows.filter((row) => OPEN_STAGES.includes(String(row.stage)));
  const days = lastSevenDays(new Date(generatedAt));
  const syncRows = signalRows.filter((row) => row.action === "integration.sync.completed").map((row) => ({ started_at: row.created_at, status: "success" }));
  const guardrailRows = signalRows.filter((row) => row.action.startsWith("guardrail.")).map((row) => ({ created_at: row.created_at, decision: row.action === "guardrail.blocked" ? "block" : "allow" }));
  const kpis: CommandCenterKpis = {
    integrationsTotal: integrationRows.length,
    integrationsConnected: integrationRows.filter((row) => row.status === "connected").length,
    integrationsDegraded: integrationRows.filter((row) => row.status !== "connected" || ["unhealthy", "failed", "degraded"].includes(String(row.health_status).toLowerCase())).length,
    pendingApprovals: changeRows.filter((row) => ["Team Approvals", "Risk Review"].includes(String(row.stage))).length,
    proposedChanges: changeRows.filter((row) => String(row.stage) === "Proposed").length,
    openHighChanges: openRows.filter((row) => ["critical", "high"].includes(String(row.severity ?? "").toLowerCase())).length,
    guardrailBlocks24h: guardrailRows.filter((row) => BLOCKING_DECISIONS.has(String(row.decision).toLowerCase()) && new Date(row.created_at).getTime() >= new Date(DEMO_NOW).getTime() - 86_400_000).length,
    syncFailures24h: 0,
    unreadNotifications: 0,
    agentsConfigured: DEMO_COMMAND_CENTER.metrics.activeAgents,
    agentsWithRealBindings: 0,
  };
  const trends = buildTrends(days, syncRows, guardrailRows, signalRows);
  return {
    live: { connected: true, provider: DEMO_GENESYS.provider, orgName: DEMO_GENESYS.orgName, region: DEMO_GENESYS.region, lastSyncAt: DEMO_GENESYS.lastSyncAt, healthStatus: DEMO_GENESYS.healthStatus, users: DEMO_GENESYS.users, activeUsers: DEMO_GENESYS.activeUsers, licensedUsers: DEMO_GENESYS.licensedUsers, licenseAssignments: DEMO_GENESYS.licenseAssignments, licenseTypes: DEMO_GENESYS.licenseTypes, queues: DEMO_GENESYS.queues, emptyQueues: DEMO_GENESYS.emptyQueues, multipleLicenseUsers: DEMO_GENESYS.multipleLicenseUsers, inactiveLicensedUsers: DEMO_GENESYS.inactiveLicensedUsers, recommendations: [], fetchedAt: generatedAt, readOnly: true },
    kpis, trends,
    genesys: { connected: true, orgName: DEMO_GENESYS.orgName, region: DEMO_GENESYS.region, lastSyncAt: DEMO_GENESYS.lastSyncAt, healthStatus: DEMO_GENESYS.healthStatus, users: DEMO_GENESYS.users, activeUsers: DEMO_GENESYS.activeUsers, queues: DEMO_GENESYS.queues, emptyQueues: DEMO_GENESYS.emptyQueues, licenseTypes: DEMO_GENESYS.licenseTypes, licenseAssignments: DEMO_GENESYS.licenseAssignments, licensedUsers: DEMO_GENESYS.licensedUsers, multipleLicenseUsers: DEMO_GENESYS.multipleLicenseUsers, inactiveLicensedUsers: DEMO_GENESYS.inactiveLicensedUsers },
    attention: { pendingChanges: kpis.pendingApprovals, proposedChanges: kpis.proposedChanges, blockingGuardrailEvaluations: kpis.guardrailBlocks24h, integrationsNeedingAttention: kpis.integrationsDegraded, unreadNotifications: kpis.unreadNotifications },
    changed: changeRows.slice(0, 8).map((row) => ({ id: String(row.id), changeId: String(row.change_id), title: String(row.title), stage: String(row.stage), severity: String(row.severity ?? "unspecified"), ownerTeam: String(row.owner_team ?? "Unassigned"), createdAt: String(row.created_at), updatedAt: String(row.updated_at ?? row.created_at) })),
    risk: { bySeverity, criticalOrHighOpen: kpis.openHighChanges, guardrailsEnabled: 8, guardrailsMonitoringOnly: 3 },
    posture: { integrations: integrationRows.map((row) => ({ id: String(row.id), provider: String(row.provider), status: String(row.status), healthStatus: String(row.health_status ?? "healthy"), lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : null, lastSyncStatus: row.last_sync_status ? String(row.last_sync_status) : null, isMock: Boolean(row.is_mock) })), agentsWithRealBindings: 0, agentsConfigured: DEMO_COMMAND_CENTER.metrics.activeAgents, lastSyncRunAt: DEMO_GENESYS.lastSyncAt, lastSyncRunStatus: "success" },
    signals: signalRows.map((row) => ({ id: String(row.id), action: String(row.action), entityType: String(row.entity_type), entityId: row.entity_id ? String(row.entity_id) : null, detail: row.detail ? String(row.detail) : null, actor: row.actor_email ? String(row.actor_email) : null, createdAt: String(row.created_at) })), generatedAt,
  };
}
function buildEmptyLiveCommandCenterData(): CommandCenterData {
  const generatedAt = new Date().toISOString();
  return { live: { connected: false, provider: null, orgName: null, region: null, lastSyncAt: null, healthStatus: null, users: 0, activeUsers: 0, licensedUsers: 0, licenseAssignments: 0, licenseTypes: 0, queues: 0, emptyQueues: 0, multipleLicenseUsers: 0, inactiveLicensedUsers: 0, recommendations: [], fetchedAt: generatedAt, readOnly: true }, kpis: emptyKpis(), trends: emptyTrends(), genesys: emptyGenesys(), attention: { pendingChanges: 0, proposedChanges: 0, blockingGuardrailEvaluations: 0, integrationsNeedingAttention: 0, unreadNotifications: 0 }, changed: [], risk: { bySeverity: {}, criticalOrHighOpen: 0, guardrailsEnabled: 0, guardrailsMonitoringOnly: 0 }, posture: { integrations: [], agentsWithRealBindings: 0, agentsConfigured: 0, lastSyncRunAt: null, lastSyncRunStatus: null }, signals: [], generatedAt };
}

export async function loadCommandCenterData(supabase: UserClientLike, userId: string): Promise<CommandCenterData> {
  const { tenantId, environmentMode } = await resolveTenantContext(supabase, userId);
  if (environmentMode === "demo") return buildDemoCommandCenterData();

  const { data: integrationSeed, error: integrationSeedError } = await supabase.from("integrations").select("id,provider,status,health_status,last_sync_at,last_sync_status,is_mock,external_org_name,region,updated_at").eq("tenant_id", tenantId).eq("is_mock", false).order("updated_at", { ascending: false });
  if (integrationSeedError) throw integrationSeedError;
  if (!integrationSeed?.length) return buildEmptyLiveCommandCenterData();

  const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const since24h = new Date(Date.now() - 86_400_000).toISOString();
  const connectedGenesys = integrationSeed.find((row) => String(row.provider).toLowerCase() === "genesys" && String(row.status).toLowerCase() === "connected") ?? null;
  const baseQueries = [
    supabase.from("change_records").select("id,change_id,title,stage,severity,owner_team,created_at,updated_at").eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(200),
    supabase.from("guardrails").select("id,enabled,enforcement_mode").or(`tenant_id.eq.${tenantId},tenant_id.is.null`),
    supabase.from("guardrail_evaluations").select("id,decision,created_at").eq("tenant_id", tenantId).gte("created_at", since7d).limit(2000),
    supabase.from("agent_integration_bindings").select("agent_key,enabled,is_mock").eq("tenant_id", tenantId),
    supabase.from("integration_sync_runs").select("started_at,finished_at,status").eq("tenant_id", tenantId).gte("started_at", since7d).order("started_at", { ascending: false }).limit(2000),
    supabase.from("notifications").select("id,unread").eq("tenant_id", tenantId).eq("unread", true).limit(200),
    supabase.from("audit_log").select("id,action,entity_type,entity_id,detail,actor_email,created_at").eq("tenant_id", tenantId).gte("created_at", since7d).order("created_at", { ascending: false }).limit(2000),
  ];
  const providerQueries = connectedGenesys ? [
    supabase.from("genesys_users").select("id,genesys_user_id,state,last_login_at").eq("tenant_id", tenantId).eq("integration_id", connectedGenesys.id).eq("is_current", true),
    supabase.from("genesys_licenses").select("id,license_id").eq("tenant_id", tenantId).eq("integration_id", connectedGenesys.id).eq("is_current", true),
    supabase.from("genesys_user_licenses").select("id,genesys_user_id,license_id").eq("tenant_id", tenantId).eq("integration_id", connectedGenesys.id).eq("is_current", true),
    supabase.from("genesys_queues").select("id,member_count").eq("tenant_id", tenantId).eq("integration_id", connectedGenesys.id).eq("is_current", true),
  ] : [];
  const results = await Promise.all([...baseQueries, ...providerQueries]);
  const [changes, guardrails, guardrailEvaluations, bindings, syncRuns, notifications, auditRows] = results;
  const genesysUsers = connectedGenesys ? results[7] : null;
  const genesysLicenses = connectedGenesys ? results[8] : null;
  const genesysUserLicenses = connectedGenesys ? results[9] : null;
  const genesysQueues = connectedGenesys ? results[10] : null;
  const changeRows = changes.data ?? []; const guardrailRows = guardrailEvaluations.data ?? []; const syncRows = syncRuns.data ?? []; const auditData = auditRows.data ?? [];
  const integrationRows = integrationSeed;
  const bindingRows = bindings.data ?? [];
  const configuredAgents = new Set(bindingRows.map((row) => String(row.agent_key))).size;
  const realBindingAgents = new Set(bindingRows.filter((row) => row.enabled && !row.is_mock).map((row) => String(row.agent_key)));
  const openRows = changeRows.filter((row) => OPEN_STAGES.includes(String(row.stage)));
  const pendingApprovals = changeRows.filter((row) => ["Team Approvals", "Risk Review"].includes(String(row.stage))).length;
  const proposedChanges = changeRows.filter((row) => String(row.stage) === "Proposed").length;
  const openHighChanges = openRows.filter((row) => ["critical", "high"].includes(String(row.severity ?? "").toLowerCase())).length;
  const now = Date.now();
  const guardrailBlocks24h = guardrailRows.filter((row) => BLOCKING_DECISIONS.has(String(row.decision).toLowerCase()) && new Date(row.created_at).getTime() >= now - 86_400_000).length;
  const syncFailures24h = syncRows.filter((row) => FAILED_SYNC_STATUSES.has(String(row.status).toLowerCase()) && new Date(row.started_at).getTime() >= now - 86_400_000).length;
  const integrationsConnected = integrationRows.filter((row) => String(row.status).toLowerCase() === "connected").length;
  const integrationsDegraded = integrationRows.filter((row) => String(row.status).toLowerCase() !== "connected" || ["unhealthy", "failed", "degraded"].includes(String(row.health_status).toLowerCase())).length;
  const kpis: CommandCenterKpis = { integrationsTotal: integrationRows.length, integrationsConnected, integrationsDegraded, pendingApprovals, proposedChanges, openHighChanges, guardrailBlocks24h, syncFailures24h, unreadNotifications: (notifications.data ?? []).length, agentsConfigured: configuredAgents, agentsWithRealBindings: realBindingAgents.size };
  const days = lastSevenDays();
  const trends = buildTrends(days, syncRows, guardrailRows, auditData);
  const bySeverity: Record<string, number> = {};
  for (const row of changeRows) { const key = String(row.severity ?? "unspecified").toLowerCase(); bySeverity[key] = (bySeverity[key] ?? 0) + 1; }

  let genesys: CommandCenterGenesys | null = null;
  if (connectedGenesys) {
    const userRows = (genesysUsers?.data ?? []) as Array<{ genesys_user_id: string; state: string | null; last_login_at: string | null }>;
    const licenseRows = (genesysLicenses?.data ?? []) as Array<{ license_id: string }>;
    const assignmentRows = (genesysUserLicenses?.data ?? []) as Array<{ genesys_user_id: string; license_id: string }>;
    const queueRows = (genesysQueues?.data ?? []) as Array<{ member_count: number | null }>;
    const assignedByUser = new Map<string, number>();
    for (const row of assignmentRows) assignedByUser.set(row.genesys_user_id, (assignedByUser.get(row.genesys_user_id) ?? 0) + 1);
    const licensedUserIds = new Set(assignmentRows.map((row) => row.genesys_user_id));
    const userById = new Map(userRows.map((row) => [row.genesys_user_id, row]));
    const inactiveLicensedUsers = [...licensedUserIds].filter((id) => String(userById.get(id)?.state ?? "").toLowerCase() === "inactive").length;
    genesys = { connected: true, orgName: connectedGenesys.external_org_name ? String(connectedGenesys.external_org_name) : null, region: connectedGenesys.region ? String(connectedGenesys.region) : null, lastSyncAt: connectedGenesys.last_sync_at ? String(connectedGenesys.last_sync_at) : null, healthStatus: connectedGenesys.health_status ? String(connectedGenesys.health_status) : null, users: userRows.length, activeUsers: userRows.filter((row) => String(row.state ?? "").toLowerCase() === "active").length, queues: queueRows.length, emptyQueues: queueRows.filter((row) => Number(row.member_count ?? 0) === 0).length, licenseTypes: new Set(licenseRows.map((row) => row.license_id)).size, licenseAssignments: assignmentRows.length, licensedUsers: licensedUserIds.size, multipleLicenseUsers: [...assignedByUser.values()].filter((count) => count > 1).length, inactiveLicensedUsers };
  }
  const liveGenesys = genesys;
  return {
    live: { connected: integrationsConnected > 0, provider: integrationRows.find((row) => String(row.status).toLowerCase() === "connected")?.provider ? String(integrationRows.find((row) => String(row.status).toLowerCase() === "connected")?.provider) : null, orgName: liveGenesys?.orgName ?? null, region: liveGenesys?.region ?? null, lastSyncAt: liveGenesys?.lastSyncAt ?? null, healthStatus: liveGenesys?.healthStatus ?? null, users: liveGenesys?.users ?? 0, activeUsers: liveGenesys?.activeUsers ?? 0, licensedUsers: liveGenesys?.licensedUsers ?? 0, licenseAssignments: liveGenesys?.licenseAssignments ?? 0, licenseTypes: liveGenesys?.licenseTypes ?? 0, queues: liveGenesys?.queues ?? 0, emptyQueues: liveGenesys?.emptyQueues ?? 0, multipleLicenseUsers: liveGenesys?.multipleLicenseUsers ?? 0, inactiveLicensedUsers: liveGenesys?.inactiveLicensedUsers ?? 0, recommendations: [], fetchedAt: new Date().toISOString(), readOnly: true },
    kpis, trends, genesys,
    attention: { pendingChanges: pendingApprovals, proposedChanges, blockingGuardrailEvaluations: guardrailBlocks24h, integrationsNeedingAttention: integrationsDegraded, unreadNotifications: kpis.unreadNotifications },
    changed: changeRows.slice(0, 8).map((row) => ({ id: String(row.id), changeId: String(row.change_id), title: String(row.title), stage: String(row.stage), severity: String(row.severity ?? "unspecified"), ownerTeam: String(row.owner_team ?? "Unassigned"), createdAt: String(row.created_at), updatedAt: String(row.updated_at ?? row.created_at) })),
    risk: { bySeverity, criticalOrHighOpen: openHighChanges, guardrailsEnabled: (guardrails.data ?? []).filter((row) => row.enabled && String(row.enforcement_mode) === "enforce").length, guardrailsMonitoringOnly: (guardrails.data ?? []).filter((row) => row.enabled && String(row.enforcement_mode) === "monitor").length },
    posture: { integrations: integrationRows.map((row) => ({ id: String(row.id), provider: String(row.provider), status: String(row.status), healthStatus: String(row.health_status ?? "healthy"), lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : null, lastSyncStatus: row.last_sync_status ? String(row.last_sync_status) : null, isMock: Boolean(row.is_mock) })), agentsWithRealBindings: realBindingAgents.size, agentsConfigured: configuredAgents, lastSyncRunAt: syncRows[0] ? String(syncRows[0].finished_at ?? syncRows[0].started_at) : null, lastSyncRunStatus: syncRows[0] ? String(syncRows[0].status) : null },
    signals: auditData.map((row) => ({ id: String(row.id), action: String(row.action), entityType: String(row.entity_type), entityId: row.entity_id ? String(row.entity_id) : null, detail: row.detail ? String(row.detail) : null, actor: row.actor_email ? String(row.actor_email) : null, createdAt: String(row.created_at) })),
    generatedAt: new Date().toISOString(),
  };
}
