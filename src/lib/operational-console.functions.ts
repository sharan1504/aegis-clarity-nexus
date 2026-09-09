import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenantContext } from "@/lib/tenant-context.server";
import type { OperationalIssueStatus } from "@/lib/operational-issues.server";

const SOURCES = ["sync", "agent_run", "integration_health", "guardrail_evaluation", "webhook_delivery", "command_center", "other"] as const;
const SEVERITIES = ["critical", "high", "medium", "low"] as const;
const STATUSES = ["open", "acknowledged", "resolved"] as const;

export const listOperationalIssues = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { source?: string; severity?: string; status?: string }) => ({ source: input.source && SOURCES.includes(input.source as any) ? input.source : null, severity: input.severity && SEVERITIES.includes(input.severity as any) ? input.severity : null, status: input.status && STATUSES.includes(input.status as any) ? input.status : null })).handler(async ({ data, context }) => {
  const tenant = await resolveTenantContext(context.supabase, context.userId);
  if (tenant.environmentMode === "demo") return { ok: true as const, environmentMode: "demo" as const, issues: [], openHighCritical: 0 };
  let query = (context.supabase as any).from("operational_issues").select("id,tenant_id,source,severity,title,detail,status,related_id,first_seen_at,last_seen_at,occurrence_count,resolved_at,resolved_by").eq("tenant_id", tenant.tenantId).order("last_seen_at", { ascending: false });
  if (data.source) query = query.eq("source", data.source);
  if (data.severity) query = query.eq("severity", data.severity);
  if (data.status) query = query.eq("status", data.status);
  const { data: rows, error } = await query.limit(500);
  if (error) throw new Error(error.message);
  const issues = rows ?? [];
  const openHighCritical = issues.filter((issue: any) => ["open", "acknowledged"].includes(issue.status) && ["critical", "high"].includes(issue.severity)).length;
  return { ok: true as const, environmentMode: "live" as const, issues, openHighCritical };
});

export const updateOperationalIssue = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { issueId: string; status: OperationalIssueStatus; note?: string }) => ({ issueId: String(input.issueId ?? "").trim(), status: input.status, note: String(input.note ?? "").trim().slice(0, 1000) })).handler(async ({ data, context }) => {
  if (!data.issueId) throw new Error("An issue id is required.");
  if (!STATUSES.includes(data.status)) throw new Error("Invalid operational issue status.");
  if (data.status === "resolved" && !data.note) throw new Error("A resolution note is required.");
  const tenant = await resolveTenantContext(context.supabase, context.userId);
  if (tenant.environmentMode === "demo") throw new Error("Operational issues are read-only in Demo mode.");
  const { data: issue, error: loadError } = await (context.supabase as any).from("operational_issues").select("id,detail,status").eq("id", data.issueId).eq("tenant_id", tenant.tenantId).single();
  if (loadError || !issue) throw new Error(loadError?.message ?? "Operational issue not found.");
  const now = new Date().toISOString();
  const history = data.note ? `${String(issue.detail)}\n\n[${data.status} note • ${now}] ${data.note}` : String(issue.detail);
  const patch = data.status === "resolved" ? { status: "resolved", detail: history, resolved_at: now, resolved_by: context.userId } : { status: data.status, detail: history, resolved_at: null, resolved_by: null };
  const { data: updated, error } = await (context.supabase as any).from("operational_issues").update(patch).eq("id", data.issueId).eq("tenant_id", tenant.tenantId).select("id,tenant_id,source,severity,title,detail,status,related_id,first_seen_at,last_seen_at,occurrence_count,resolved_at,resolved_by").single();
  if (error || !updated) throw new Error(error?.message ?? "Operational issue could not be updated.");
  return { ok: true as const, issue: updated };
});
