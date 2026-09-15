import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";
import { resolveDepartmentContext } from "@/lib/department-access.server";

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

function startForWindow(window: ProductivityWindow, now = new Date()) {
  const start = new Date(now);
  if (window === "week") start.setDate(start.getDate() - 7);
  if (window === "month") start.setMonth(start.getMonth() - 1);
  if (window === "3_months") start.setMonth(start.getMonth() - 3);
  if (window === "6_months") start.setMonth(start.getMonth() - 6);
  if (window === "year") start.setFullYear(start.getFullYear() - 1);
  return start;
}

function matchesUser(payload: any, user: string) {
  const needle = user.trim().toLowerCase();
  if (!needle) return true;
  return [payload?.assignee, payload?.assigneeName, payload?.owner, payload?.ownerName, payload?.assignedTo, payload?.userName, payload?.agentName]
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
  const from = startForWindow(input.window);
  const to = new Date();
  const { data: connections } = await supabase.from("provider_connections").select("id,provider,status,last_sync_at").eq("tenant_id", tenantId).eq("status", "connected");
  const provider = input.provider.toLowerCase();
  const matchingConnections = (connections ?? []).filter((c: any) => c.provider === provider);
  if (!matchingConnections.length) {
    return { provider, user: input.user, window: input.window, from: from.toISOString(), to: to.toISOString(), totalHandled: 0, completed: 0, open: 0, throughputPerWeek: 0, averageCycleTimeHours: null, rows: [], sources: [], warnings: [`${provider} is not connected for this tenant.`] };
  }
  let allowedIds: string[] | null = matchingConnections.map((c: any) => String(c.id));
  if (!department.unrestricted) {
    const departmentId = department.departments.find((d) => d.department_key === department.departmentKey)?.id;
    const { data: access } = await supabase.from("department_provider_connection_access").select("connection_id").eq("tenant_id", tenantId).eq("department_id", departmentId).eq("enabled", true);
    const explicit = (access ?? []).map((x: any) => String(x.connection_id));
    if (explicit.length) allowedIds = allowedIds.filter((id) => explicit.includes(id));
  }
  const { data: entities } = await supabase.from("provider_sync_entities").select("provider,connection_id,entity_type,entity_key,payload,observed_at").eq("tenant_id", tenantId).eq("provider", provider).eq("stale", false);
  const candidates = (entities ?? []).filter((entity: any) => allowedIds?.includes(String(entity.connection_id)) && ["issue", "ticket", "case", "task", "work_item", "interaction", "activity"].includes(String(entity.entity_type).toLowerCase()));
  const rows = candidates.map(toRow).filter((row: ProductivityReportRow) => matchesUser(candidates.find((e: any) => toRow(e).workItemId === row.workItemId)?.payload ?? {}, input.user));
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
  const sourceRows = matchingConnections.filter((c: any) => allowedIds?.includes(String(c.id))).map((c: any) => ({ provider, records: inWindow.length, observedAt: c.last_sync_at ?? null }));
  return {
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
}

export const generateProductivityReport = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { provider: string; user: string; window: ProductivityWindow; departmentKey?: string | null }) => ({ provider: String(input?.provider ?? "").trim(), user: String(input?.user ?? "").trim(), window: input?.window ?? "month", departmentKey: input?.departmentKey ?? null })).handler(async ({ data, context }) => {
  if (!data.provider || !data.user) return { ok: false as const, error: "Provider and user are required." };
  return { ok: true as const, report: await buildProductivityReport(context.supabase, context.userId, data) };
});
