import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
export type OperationalIssueSource = "sync" | "agent_run" | "integration_health" | "guardrail_evaluation" | "webhook_delivery" | "command_center" | "other";
export type OperationalIssueSeverity = "critical" | "high" | "medium" | "low";
export type OperationalIssueStatus = "open" | "acknowledged" | "resolved";
export interface OperationalIssueInput { tenantId: string; source: OperationalIssueSource; severity: OperationalIssueSeverity; title: string; detail: string; relatedId?: string | null; fingerprint?: string; }
export interface OperationalIssueRecord { id: string; tenantId: string; source: OperationalIssueSource; severity: OperationalIssueSeverity; title: string; detail: string; status: OperationalIssueStatus; relatedId: string | null; dedupeKey: string; firstSeenAt: string; lastSeenAt: string; occurrenceCount: number; resolvedAt: string | null; resolvedBy: string | null; }
type Client = SupabaseClient<Database>;

export async function recordOperationalIssue(supabase: Client, input: OperationalIssueInput): Promise<OperationalIssueRecord | null> {
  const { data: issueId, error } = await (supabase as any).rpc("record_operational_issue", { p_tenant_id: input.tenantId, p_source: input.source, p_severity: input.severity, p_title: input.title, p_detail: input.detail, p_related_id: input.relatedId ?? null, p_fingerprint: input.fingerprint ?? null });
  if (error || !issueId) { console.error("[operational-console] issue record failed", error?.message); return null; }
  const { data, error: loadError } = await (supabase as any).from("operational_issues").select("id,tenant_id,source,severity,title,detail,status,related_id,dedupe_key,first_seen_at,last_seen_at,occurrence_count,resolved_at,resolved_by").eq("id", issueId).eq("tenant_id", input.tenantId).single();
  if (loadError || !data) { console.error("[operational-console] issue reload failed", loadError?.message); return null; }
  return { id: String(data.id), tenantId: String(data.tenant_id), source: data.source, severity: data.severity, title: String(data.title), detail: String(data.detail), status: data.status, relatedId: data.related_id ? String(data.related_id) : null, dedupeKey: String(data.dedupe_key), firstSeenAt: String(data.first_seen_at), lastSeenAt: String(data.last_seen_at), occurrenceCount: Number(data.occurrence_count), resolvedAt: data.resolved_at ? String(data.resolved_at) : null, resolvedBy: data.resolved_by ? String(data.resolved_by) : null };
}
export async function recordOperationalIssueSafely(supabase: Client, input: OperationalIssueInput): Promise<void> { try { await recordOperationalIssue(supabase, input); } catch (error) { console.error("[operational-console] unexpected recorder failure", error); } }
