import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant, getIntegrationSummary, getAccessToken } from "@/lib/genesys/store.server";
import * as genesys from "@/lib/genesys/connector.server";

export interface LiveRecommendation { key: string; title: string; severity: "critical" | "high" | "medium" | "low"; category: "License" | "Operations"; impact: string; evidence: string; action: string; canExecute: boolean; }
export interface LiveWorkspaceData { connected: boolean; provider: "Genesys Cloud" | null; orgName: string | null; region: string | null; lastSyncAt: string | null; healthStatus: string | null; users: number; activeUsers: number; licensedUsers: number; licenseAssignments: number; licenseTypes: number; queues: number; emptyQueues: number; multipleLicenseUsers: number; inactiveLicensedUsers: number; recommendations: LiveRecommendation[]; fetchedAt: string; readOnly: boolean; }
function daysSince(value: string | null) { if (!value) return Number.POSITIVE_INFINITY; return Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000); }

export async function loadLiveWorkspaceData(supabase: Parameters<typeof resolveTenant>[0], userId: string): Promise<LiveWorkspaceData> {
  const { tenantId } = await resolveTenant(supabase, userId);
  const integration = await getIntegrationSummary(supabase, tenantId);
  if (!integration?.id || integration.status !== "connected") return { connected: false, provider: null, orgName: null, region: null, lastSyncAt: integration?.lastSyncAt ?? null, healthStatus: integration?.healthStatus ?? null, users: 0, activeUsers: 0, licensedUsers: 0, licenseAssignments: 0, licenseTypes: 0, queues: 0, emptyQueues: 0, multipleLicenseUsers: 0, inactiveLicensedUsers: 0, recommendations: [], fetchedAt: new Date().toISOString(), readOnly: true };

  const token = await getAccessToken(integration.id, tenantId, integration.region);
  const [users, assignments, licenses, queues] = await Promise.all([
    genesys.listUsers(token, integration.region),
    genesys.listUserLicenseAssignments(token, integration.region),
    genesys.listLicenses(token, integration.region),
    genesys.listQueues(token, integration.region),
  ]);
  const assignedByUser = new Map<string, string[]>();
  for (const assignment of assignments) assignedByUser.set(assignment.genesysUserId, assignment.licenseIds);
  const licensedUsers = [...assignedByUser.values()].filter((x) => x.length > 0).length;
  const multipleLicenseUsers = users.filter((u) => (assignedByUser.get(u.id)?.length ?? 0) > 1);
  const inactiveLicensedUsers = users.filter((u) => (assignedByUser.get(u.id)?.length ?? 0) > 0 && daysSince(u.lastLoginAt) >= 90);
  const activeUsers = users.filter((u) => u.state === "active").length;
  const emptyQueues = queues.filter((q) => (q.memberCount ?? 0) === 0);
  const recommendations: LiveRecommendation[] = [];
  if (inactiveLicensedUsers.length > 0) recommendations.push({ key: "genesys-inactive-licensed-users", title: `Review ${inactiveLicensedUsers.length} licensed users with 90+ days of inactivity`, severity: inactiveLicensedUsers.length >= 10 ? "high" : "medium", category: "License", impact: `${inactiveLicensedUsers.length} licensed accounts need review`, evidence: "Current Genesys user activity and license assignments show assigned licenses with no observed login/activity for at least 90 days.", action: "Validate employment, leave status and business need before reclaiming any license.", canExecute: false });
  if (multipleLicenseUsers.length > 0) recommendations.push({ key: "genesys-multiple-licenses", title: `Review ${multipleLicenseUsers.length} users with multiple Genesys licenses`, severity: "medium", category: "License", impact: `${multipleLicenseUsers.length} users have overlapping entitlements`, evidence: "The live license assignment endpoint reports more than one license for these users.", action: "Review whether each entitlement is required; do not remove access automatically.", canExecute: false });
  if (emptyQueues.length > 0) recommendations.push({ key: "genesys-empty-queues", title: `Review ${emptyQueues.length} Genesys queues with no members`, severity: "low", category: "Operations", impact: `${emptyQueues.length} queues currently have zero members`, evidence: "Live Genesys routing queue data reports memberCount = 0.", action: "Confirm whether each queue is intentionally inactive before changing routing configuration.", canExecute: false });
  return { connected: true, provider: "Genesys Cloud", orgName: integration.externalOrgName, region: integration.region, lastSyncAt: integration.lastSyncAt, healthStatus: integration.healthStatus, users: users.length, activeUsers, licensedUsers, licenseAssignments: assignments.reduce((sum, row) => sum + row.licenseIds.length, 0), licenseTypes: licenses.length, queues: queues.length, emptyQueues: emptyQueues.length, multipleLicenseUsers: multipleLicenseUsers.length, inactiveLicensedUsers: inactiveLicensedUsers.length, recommendations, fetchedAt: new Date().toISOString(), readOnly: true };
}

export const getLiveWorkspaceData = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => loadLiveWorkspaceData(context.supabase, context.userId));

export const createLiveRecommendationApproval = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { recommendation: LiveRecommendation; snapshot: LiveWorkspaceData }) => input).handler(async ({ data, context }) => {
  const { tenantId } = await resolveTenant(context.supabase, context.userId);
  const recommendation = data.recommendation;
  const changeId = `AIG-${Date.now().toString(36).toUpperCase()}`;
  const insert = { tenant_id: tenantId, change_id: changeId, title: recommendation.title, stage: "Team Approvals", severity: recommendation.severity, risk: { tier: recommendation.severity === "high" || recommendation.severity === "critical" ? "High" : "Medium", score: recommendation.severity === "high" ? 60 : 35, factors: ["Generated from live Genesys telemetry", "Read-only source validation", "Human approval required"] }, execution_mode: "Manual", owner_team: recommendation.category === "License" ? "Contact Center / Licensing Operations" : "Contact Center Operations", requester: "Aegis Live Analysis", category: recommendation.category, agent: "Aegis Live Analysis", change_window: { start: new Date().toISOString(), end: new Date(Date.now() + 3_600_000).toISOString(), inMaintenance: false }, business_impact: recommendation.impact, ai_reasoning: `${recommendation.evidence} Recommended action: ${recommendation.action}`, rollback_steps: ["No provider change is executed by the current read-only Genesys connector.", "If a future write-capable connector is enabled, validate the proposed mutation and rollback plan before execution."], validations: [{ name: "Live source", status: "passed", detail: `Fetched ${data.snapshot.fetchedAt} from ${data.snapshot.orgName ?? "Genesys Cloud"}.` }, { name: "Write capability", status: "warning", detail: "Current Genesys integration is read-only; approval records intent but does not mutate Genesys." }], external_tickets: [], timeline: [{ ts: new Date().toISOString(), actor: context.userId, kind: "system", text: "Approval request created from live Genesys recommendation." }] };
  const { data: record, error } = await context.supabase.from("change_records").insert(insert).select("id, change_id").single();
  if (error || !record) throw new Error(error?.message ?? "Could not create approval request.");
  const { error: approvalError } = await context.supabase.from("change_approvals").insert({ tenant_id: tenantId, change_record_id: record.id, team: insert.owner_team, approver: context.userId, approver_role: "Workspace approver", status: "pending", position: 0 });
  if (approvalError) throw new Error(approvalError.message);
  return { ok: true as const, changeId: record.change_id };
});
