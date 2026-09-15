import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";
import { resolveDepartmentContext } from "@/lib/department-access.server";
import { enforceGuardrails } from "@/lib/guardrails/engine.server";
import { writeAuditServer } from "@/lib/audit.server";

export type ProductivityWindow = "week" | "month" | "3_months" | "6_months" | "year";

export interface ProductivityReportRow {
  provider: string;
  workItemId: string;
  title: string;
  assignee: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  project: string | null;
  url: string | null;
}

export interface ProductivityReport {
  provider: string;
  user: string;
  window: ProductivityWindow;
  from: string;
  to: string;
  totalHandled: number;
  completed: number;
  open: number;
  throughputPerWeek: number;
  averageCycleTimeHours: number | null;
  rows: ProductivityReportRow[];
  sources: Array<{ provider: string; records: number; observedAt: string | null }>;
  warnings: string[];
}

const WORK_ITEM_TYPES = new Set(["issue", "ticket", "case", "task", "work_item", "interaction", "activity"]);

function startForWindow(window: ProductivityWindow, now = new Date()) {
  const start = new Date(now);
  if (window === "week") start.setDate(start.getDate() - 7);
  if (window === "month") start.setMonth(start.getMonth() - 1);
  if (window === "3_months") start.setMonth(start.getMonth() - 3);
  if (window === "6_months") start.setMonth(start.getMonth() - 6);
  if (window === "year") start.setFullYear(start.getFullYear() - 1);
  return start;
}

function profileIdentity(profile: Record<string, unknown>) {
  return [profile.id, profile.email, profile.work_email, profile.display_name, profile.full_name, profile.name]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());
}

async function authorizeTarget(supabase: any, tenantId: string, userId: string, requestedUser: string, department: Awaited<ReturnType<typeof resolveDepartmentContext>>) {
  const needle = requestedUser.trim().toLowerCase();
  const { data: requester } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  const ownIdentity = requester ? profileIdentity({ ...requester, id: userId }) : [userId.toLowerCase()];
  if (ownIdentity.includes(needle)) return { targetUserId: userId, self: true };

  const privileged = department.roles.some((role) => role === "admin" || role === "manager");
  if (!privileged) throw new Error("You may only view your own productivity report.");

  let targetIds: string[] | null = null;
  if (!department.unrestricted) {
    const selectedDepartment = department.departments.find((d) => d.department_key === department.departmentKey);
    if (!selectedDepartment) throw new Error("You are not authorized for that department.");
    const { data: memberships, error } = await supabase.from("user_department_memberships").select("user_id").eq("tenant_id", tenantId).eq("department_id", selectedDepartment.id);
    if (error) throw new Error(error.message);
    targetIds = (memberships ?? []).map((row: any) => String(row.user_id));
  }

  let profileQuery = supabase.from("profiles").select("*").eq("tenant_id", tenantId);
  if (targetIds) {
    if (!targetIds.length) throw new Error("No users are assigned to this department.");
    profileQuery = profileQuery.in("id", targetIds);
  }
  const { data: profiles, error: profileError } = await profileQuery;
  if (profileError) throw new Error(profileError.message);
  const target = (profiles ?? []).find((profile: any) => profileIdentity(profile).includes(needle));
  if (!target) throw new Error("The requested user is outside your authorized productivity scope or could not be resolved.");
  return { targetUserId: String(target.id), self: false };
}

function matchesUser(payload: any, user: string) {
  const needle = user.trim().toLowerCase();
  if (!needle) return true;
  return [payload?.assignee, payload?.assigneeName, payload?.owner, payload?.ownerName, payload?.assignedTo, payload?.userName, payload?.agentName, payload?.assigneeEmail, payload?.ownerEmail]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

function isCompleted(status: string) {
  return /^(done|closed|resolved|complete|completed|cancelled|canceled|fulfilled)$/i.test(status.trim()) || /(done|closed|resolved|complete|completed|cancelled|canceled|fulfilled)/i.test(status);
}

function toRow(entity: any): ProductivityReportRow {
  const p = entity.payload ?? {};
  return {
    provider: String(entity.provider),
    workItemId: String(p.key ?? p.id ?? entity.entity_key),
    title: String(p.summary ?? p.subject ?? p.title ?? p.name ?? "Untitled work item"),
    assignee: String(p.assignee ?? p.assigneeName ?? p.owner ?? p.ownerName ?? p.assignedTo ?? p.userName ?? p.agentName ?? "Unassigned"),
    status: String(p.status ?? p.state ?? p.stage ?? "Unknown"),
    createdAt: p.createdAt ?? p.created ?? null,
    updatedAt: p.updatedAt ?? p.updated ?? null,
    completedAt: p.completedAt ?? p.resolvedAt ?? p.closedAt ?? p.completed_at ?? null,
    project: p.project ?? p.projectKey ?? p.account ?? null,
    url: p.url ?? p.self ?? p.htmlUrl ?? null,
  };
}

export async function buildProductivityReport(supabase: any, userId: string, input: { provider: string; user: string; window: ProductivityWindow; departmentKey?: string | null }): Promise<ProductivityReport> {
  const { tenantId } = await resolveTenant(supabase, userId);
  const department = await resolveDepartmentContext(supabase, userId, input.departmentKey);
  const provider = input.provider.trim().toLowerCase();
  const from = startForWindow(input.window);
  const to = new Date();
  const target = await authorizeTarget(supabase, tenantId, userId, input.user, department);

  const { data: capabilityDef, error: capabilityDefError } = await supabase.from("capabilities").select("id").eq("capability_key", "productivity_activity").maybeSingle();
  if (capabilityDefError) throw new Error(capabilityDefError.message);
  if (!capabilityDef?.id) throw new Error("Productivity Activity capability is not registered.");
  const { data: capability, error: capabilityError } = await supabase.from("provider_capabilities").select("implemented,notes").eq("provider", provider).eq("capability_id", capabilityDef.id).maybeSingle();
  if (capabilityError) throw new Error(capabilityError.message);
  if (!capability?.implemented) {
    return { provider, user: input.user, window: input.window, from: from.toISOString(), to: to.toISOString(), totalHandled: 0, completed: 0, open: 0, throughputPerWeek: 0, averageCycleTimeHours: null, rows: [], sources: [], warnings: [capability?.notes ?? `${provider} productivity activity is not implemented yet.`, "CenOps does not use sample data for unavailable providers."] };
  }

  const { data: connections, error: connectionError } = await supabase.from("provider_connections").select("id,provider,status,last_sync_at,is_mock").eq("tenant_id", tenantId).eq("provider", provider).eq("status", "connected");
  if (connectionError) throw new Error(connectionError.message);
  const liveConnections = (connections ?? []).filter((connection: any) => !connection.is_mock);
  if (!liveConnections.length) {
    return { provider, user: input.user, window: input.window, from: from.toISOString(), to: to.toISOString(), totalHandled: 0, completed: 0, open: 0, throughputPerWeek: 0, averageCycleTimeHours: null, rows: [], sources: [], warnings: [`${provider} is not connected with a live provider connection for this tenant.`] };
  }

  let allowedIds = liveConnections.map((connection: any) => String(connection.id));
  if (!department.unrestricted) {
    const selectedDepartment = department.departments.find((d) => d.department_key === department.departmentKey);
    if (!selectedDepartment) throw new Error("You are not authorized for that department.");
    const { data: access, error } = await supabase.from("department_provider_connection_access").select("connection_id").eq("tenant_id", tenantId).eq("department_id", selectedDepartment.id).eq("enabled", true);
    if (error) throw new Error(error.message);
    const explicit = (access ?? []).map((row: any) => String(row.connection_id));
    allowedIds = allowedIds.filter((id) => explicit.includes(id));
  }
  if (!allowedIds.length) {
    return { provider, user: input.user, window: input.window, from: from.toISOString(), to: to.toISOString(), totalHandled: 0, completed: 0, open: 0, throughputPerWeek: 0, averageCycleTimeHours: null, rows: [], sources: [], warnings: [`${provider} is connected, but is not enabled for Productivity Agent in your authorized scope.`] };
  }

  await enforceGuardrails(supabase, {
    tenantId,
    actorRole: department.roles.includes("admin") ? "admin" : department.roles.includes("manager") ? "manager" : department.roles[0] ?? null,
    agentKey: "agent-productivity",
    provider,
    capability: "productivity_activity",
    actionKey: "productivity.report",
    executionClass: "read_only",
    affectedRecords: 0,
    dataClassification: "confidential",
    origin: "agent",
  }, { origin: "productivity_agent", userId });

  const { data: entities, error: entityError } = await supabase.from("provider_sync_entities").select("provider,connection_id,entity_type,entity_key,payload,observed_at").eq("tenant_id", tenantId).eq("provider", provider).eq("stale", false);
  if (entityError) throw new Error(entityError.message);
  const candidates = (entities ?? []).filter((entity: any) => allowedIds.includes(String(entity.connection_id)) && WORK_ITEM_TYPES.has(String(entity.entity_type).toLowerCase()));
  const rows = candidates.map(toRow).filter((row: ProductivityReportRow) => matchesUser(candidates.find((entity: any) => toRow(entity).workItemId === row.workItemId)?.payload ?? {}, input.user));
  const inWindow = rows.filter((row) => {
    const date = row.completedAt ?? row.updatedAt ?? row.createdAt;
    const parsed = date ? new Date(date).getTime() : NaN;
    return Number.isFinite(parsed) && parsed >= from.getTime() && parsed <= to.getTime();
  });
  const completed = inWindow.filter((row) => isCompleted(row.status) || Boolean(row.completedAt));
  const cycleHours = completed.map((row) => {
    const start = row.createdAt ? new Date(row.createdAt).getTime() : NaN;
    const end = row.completedAt ? new Date(row.completedAt).getTime() : NaN;
    return Number.isFinite(start) && Number.isFinite(end) && end >= start ? (end - start) / 3600000 : NaN;
  }).filter(Number.isFinite) as number[];
  const weeks = Math.max(1, (to.getTime() - from.getTime()) / (7 * 86400000));
  const sourceRows = liveConnections.filter((connection: any) => allowedIds.includes(String(connection.id))).map((connection: any) => ({ provider, records: inWindow.length, observedAt: connection.last_sync_at ?? null }));
  const report: ProductivityReport = {
    provider,
    user: input.user,
    window: input.window,
    from: from.toISOString(),
    to: to.toISOString(),
    totalHandled: inWindow.length,
    completed: completed.length,
    open: Math.max(0, inWindow.length - completed.length),
    throughputPerWeek: Number((completed.length / weeks).toFixed(1)),
    averageCycleTimeHours: cycleHours.length ? Number((cycleHours.reduce((a, b) => a + b, 0) / cycleHours.length).toFixed(1)) : null,
    rows: inWindow.sort((a, b) => String(b.updatedAt ?? b.createdAt ?? "").localeCompare(String(a.updatedAt ?? a.createdAt ?? ""))).slice(0, 100),
    sources: sourceRows,
    warnings: inWindow.length ? [] : [`No synchronized work-item records matched ${input.user} for the selected ${input.window.replace("_", " ")} window.`],
  };
  if (!target.self) {
    await writeAuditServer(supabase, {
      tenantId,
      action: "productivity.report_viewed",
      entityType: "user",
      entityId: target.targetUserId,
      detail: `Productivity report viewed for ${input.user}.`,
      payload: { provider, window: input.window, departmentKey: department.departmentKey, agentKey: "agent-productivity" },
    });
  }
  return report;
}

export const generateProductivityReport = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { provider: string; user: string; window: ProductivityWindow; departmentKey?: string | null }) => ({ provider: String(input?.provider ?? "").trim(), user: String(input?.user ?? "").trim(), window: input?.window ?? "month", departmentKey: input?.departmentKey ?? null })).handler(async ({ data, context }) => {
  if (!data.provider || !data.user) return { ok: false as const, error: "Provider and user are required." };
  return { ok: true as const, report: await buildProductivityReport(context.supabase, context.userId, data) };
});
