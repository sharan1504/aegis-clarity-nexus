/** Tenant-scoped audit repository backed by Supabase. */
import { computeStats, filterEvents, relatedEvents } from "./query";
import { redactEvent, type RedactionContext } from "./redaction";
import { buildSeedAuditEvents } from "./seed";
import type { AuditEvent, AuditFilters, AuditStats } from "./types";
import { supabase } from "@/integrations/supabase/client";
import { resolveTenantContext } from "@/lib/tenant-context.server";

export interface AuditRepository { list(filters: AuditFilters, ctx: RedactionContext): Promise<AuditEvent[]>; get(id: string, ctx: RedactionContext): Promise<AuditEvent | null>; related(id: string, ctx: RedactionContext): Promise<AuditEvent[]>; stats(filters: AuditFilters, ctx: RedactionContext): Promise<AuditStats>; record(event: Omit<AuditEvent, "id">): Promise<AuditEvent>; }
type AuditRow = any;
function fromRow(row: AuditRow): AuditEvent { return { id: row.id, correlationId: row.correlation_id, timestamp: row.timestamp, actor: { id: row.actor_id ?? "system", name: row.actor_name, email: row.actor_email, role: row.actor_role, type: row.actor_type }, action: row.action, resourceType: row.resource_type, resourceName: row.resource_name, targetId: row.target_id, integration: row.integration, agent: row.agent, changes: row.changes ?? [], reason: row.reason, approvalId: row.approval_id, approvalStatus: row.approval_status ?? undefined, result: row.result, risk: row.risk, source: row.source ?? { channel: "web" }, metadata: row.metadata ?? {}, seeded: row.seeded }; }
async function currentTenantId() { const { data: auth } = await supabase.auth.getUser(); if (!auth.user) return null; const { data } = await supabase.from("profiles").select("tenant_id").eq("id", auth.user.id).maybeSingle(); return data?.tenant_id ?? null; }
export class SupabaseAuditRepository implements AuditRepository {
  async list(filters: AuditFilters, ctx: RedactionContext) { const tenantId = await currentTenantId(); if (!tenantId) return []; const { data, error } = await (supabase as any).from("audit_events").select("*").eq("tenant_id", tenantId).order("timestamp", { ascending: false }).limit(10000); if (error) throw new Error(`Unable to load audit events: ${error.message}`); return filterEvents((data ?? []).map(fromRow), filters).map((e) => redactEvent(e, ctx)); }
  async get(id: string, ctx: RedactionContext) { const tenantId = await currentTenantId(); if (!tenantId) return null; const { data, error } = await (supabase as any).from("audit_events").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle(); if (error) throw new Error(`Unable to load audit event: ${error.message}`); return data ? redactEvent(fromRow(data), ctx) : null; }
  async related(id: string, ctx: RedactionContext) { const tenantId = await currentTenantId(); if (!tenantId) return []; const event = await this.get(id, { canSeeSensitiveMetadata: true }); if (!event) return []; const { data, error } = await (supabase as any).from("audit_events").select("*").eq("tenant_id", tenantId).eq("correlation_id", event.correlationId).order("timestamp", { ascending: true }); if (error) throw new Error(`Unable to load related audit events: ${error.message}`); return relatedEvents((data ?? []).map(fromRow), event).map((e) => redactEvent(e, ctx)); }
  async stats(filters: AuditFilters, ctx: RedactionContext) { return computeStats(await this.list(filters, ctx)); }
  async record(event: Omit<AuditEvent, "id">) { const tenantId = await currentTenantId(); if (!tenantId) throw new Error("No authenticated workspace is available for audit recording."); const row = { tenant_id: tenantId, correlation_id: event.correlationId, timestamp: event.timestamp, actor_id: event.actor.type === "system" ? null : event.actor.id, actor_name: event.actor.name, actor_email: event.actor.email, actor_role: event.actor.role, actor_type: event.actor.type, action: event.action, resource_type: event.resourceType, resource_name: event.resourceName, target_id: event.targetId, integration: event.integration ?? null, agent: event.agent ?? null, changes: event.changes ?? [], reason: event.reason ?? null, approval_id: event.approvalId ?? null, approval_status: event.approvalStatus ?? null, result: event.result, risk: event.risk, source: event.source, metadata: event.metadata ?? {}, seeded: false }; const { data, error } = await (supabase as any).from("audit_events").insert(row).select("*").single(); if (error || !data) throw new Error(error?.message ?? "Unable to persist audit event."); return redactEvent(fromRow(data), { canSeeSensitiveMetadata: false }); }
}
export const demoAuditRepository: AuditRepository = { async list(filters, ctx) { return filterEvents(buildSeedAuditEvents(), filters).map((e) => redactEvent(e, ctx)); }, async get(id, ctx) { const e = buildSeedAuditEvents().find((x) => x.id === id); return e ? redactEvent(e, ctx) : null; }, async related(id, ctx) { const all = buildSeedAuditEvents(); const e = all.find((x) => x.id === id); return e ? relatedEvents(all, e).map((x) => redactEvent(x, ctx)) : []; }, async stats(filters, ctx) { return computeStats(await this.list(filters, ctx)); }, async record() { throw new Error("Demo repository is read-only."); } };
async function resolveAuditRepository(): Promise<AuditRepository> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new SupabaseAuditRepository();
  const { environmentMode } = await resolveTenantContext(supabase, auth.user.id);
  return environmentMode === "demo" ? demoAuditRepository : new SupabaseAuditRepository();
}

export const auditRepository: AuditRepository = {
  async list(filters, ctx) { return (await resolveAuditRepository()).list(filters, ctx); },
  async get(id, ctx) { return (await resolveAuditRepository()).get(id, ctx); },
  async related(id, ctx) { return (await resolveAuditRepository()).related(id, ctx); },
  async stats(filters, ctx) { return (await resolveAuditRepository()).stats(filters, ctx); },
  async record(event) { return (await resolveAuditRepository()).record(event); },
};
