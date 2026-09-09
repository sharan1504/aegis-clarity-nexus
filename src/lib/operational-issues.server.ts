import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type OperationalIssueSource = "sync" | "agent_run" | "integration_health" | "guardrail_evaluation" | "webhook_delivery" | "command_center" | "other";
export type OperationalIssueSeverity = "critical" | "high" | "medium" | "low";
export type OperationalIssueStatus = "open" | "acknowledged" | "resolved";
export interface OperationalIssueInput { tenantId: string; source: OperationalIssueSource; severity: OperationalIssueSeverity; title: string; detail: string; relatedId?: string | null; fingerprint?: string; }
export interface OperationalIssueRecord extends OperationalIssueInput { id: string; status: OperationalIssueStatus; dedupeKey: string; firstSeenAt: string; lastSeenAt: string; occurrenceCount: number; resolvedAt: string | null; resolvedBy: string | null; }
type Client = SupabaseClient<Database>;

function stableFingerprint(input: OperationalIssueInput): string {
  if (input.fingerprint?.trim()) return input.fingerprint.trim();
  const normalized = `${input.source}|${input.relatedId?.trim() ?? ""}|${input.title.trim()}|${input.detail.trim().toLowerCase()}`;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}
function dedupeKey(input: OperationalIssueInput): string { return `${input.source}:${input.relatedId?.trim() || stableFingerprint(input)}`; }

async function notifyTenantAdmins(supabase: Client, input: OperationalIssueInput, issueId: string): Promise<void> {
  if (input.severity !== "critical" && input.severity !== "high") return;
  const { data: admins, error } = await supabase.from("user_roles").select("user_id").eq("tenant_id", input.tenantId).eq("role", "admin");
  if (error) { console.error("[operational-console] admin lookup failed", error.message); return; }
  const userIds = [...new Set((admins ?? []).map((row) => String(row.user_id)))];
  if (!userIds.length) return;
  const rows = userIds.map((userId) => ({ tenant_id: input.tenantId, user_id: userId, kind: "operational_issue", title: `${input.severity.toUpperCase()}: ${input.title.trim()}`, body: input.detail.trim().slice(0, 2000), href: `/operational-console?issue=${encodeURIComponent(issueId)}` }));
  const { error: insertError } = await supabase.from("notifications").insert(rows);
  if (insertError) console.error("[operational-console] notification insert failed", insertError.message);
}

export async function recordOperationalIssue(supabase: Client, input: OperationalIssueInput): Promise<OperationalIssueRecord | null> {
  const key = dedupeKey(input);
  const now = new Date().toISOString();
  const { data: existing, error: lookupError } = await supabase.from("operational_issues" as never).select("id,status,occurrence_count,first_seen_at,resolved_at,resolved_by").eq("tenant_id", input.tenantId).eq("dedupe_key", key).maybeSingle();
  if (lookupError) { console.error("[operational-console] issue lookup failed", lookupError.message); return null; }
  const isNewActiveIssue = !existing || existing.status === "resolved";
  const nextStatus = existing?.status === "resolved" ? "open" : existing?.status ?? "open";
  const payload = { tenant_id: input.tenantId, source: input.source, severity: input.severity, title: input.title.trim().slice(0, 300), detail: input.detail.trim().slice(0, 10000), status: nextStatus, related_id: input.relatedId ?? null, dedupe_key: key, first_seen_at: existing?.first_seen_at ?? now, last_seen_at: now, occurrence_count: Number(existing?.occurrence_count ?? 0) + 1, resolved_at: nextStatus === "open" ? null : existing?.resolved_at ?? null, resolved_by: nextStatus === "open" ? null : existing?.resolved_by ?? null };
  const { data, error } = await supabase.from("operational_issues" as never).upsert(payload as never, { onConflict: "tenant_id,dedupe_key" }).select("id,tenant_id,source,severity,title,detail,status,related_id,dedupe_key,first_seen_at,last_seen_at,occurrence_count,resolved_at,resolved_by").single();
  if (error || !data) { console.error("[operational-console] issue record failed", error?.message); return null; }
  const record: OperationalIssueRecord = { id: String((data as any).id), tenantId: String((data as any).tenant_id), source: (data as any).source, severity: (data as any).severity, title: String((data as any).title), detail: String((data as any).detail), status: (data as any).status, relatedId: (data as any).related_id ? String((data as any).related_id) : null, dedupeKey: String((data as any).dedupe_key), firstSeenAt: String((data as any).first_seen_at), lastSeenAt: String((data as any).last_seen_at), occurrenceCount: Number((data as any).occurrence_count), resolvedAt: (data as any).resolved_at ? String((data as any).resolved_at) : null, resolvedBy: (data as any).resolved_by ? String((data as any).resolved_by) : null };
  if (isNewActiveIssue) await notifyTenantAdmins(supabase, input, record.id);
  return record;
}
export async function recordOperationalIssueSafely(supabase: Client, input: OperationalIssueInput): Promise<void> { try { await recordOperationalIssue(supabase, input); } catch (error) { console.error("[operational-console] unexpected recorder failure", error); } }
