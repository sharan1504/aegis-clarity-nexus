// Immutable audit trail. Every sensitive action writes exactly one entry.
// The database seals each row with a per-tenant SHA-256 hash chain and blocks
// UPDATE/DELETE, so entries can never be edited or removed from the app.
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type AuditAction =
  | "change.approved"
  | "change.rejected"
  | "change.bulk_approved"
  | "change.bulk_rejected"
  | "change.executed"
  | "change.rollback_initiated"
  | "ticket.created"
  | "report.generated"
  | "report.downloaded"
  | "report.link_issued"
  | "integration.connected"
  | "role.changed";

export interface AuditInput {
  tenantId: string;
  action: AuditAction;
  entityType: "change_record" | "approval" | "report" | "ticket" | "integration" | "user";
  entityId?: string;
  detail?: string;
  payload?: Record<string, unknown>;
  actorRole?: string;
}

export async function writeAudit(input: AuditInput) {
  // Actor identity (actor_id / actor_email / actor_role) is derived server-side
  // by a database trigger from the verified session — never sent by the client.
  const { data, error } = await supabase
    .from("audit_log")
    .insert({
      tenant_id: input.tenantId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      detail: input.detail ?? null,
      payload: (input.payload ?? {}) as unknown as Json,
    })
    .select("id, hash, prev_hash, created_at")
    .single();


  if (error) throw error;
  return data;
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  detail: string | null;
  hash: string;
  prevHash: string | null;
  createdAt: string;
}

export async function fetchAuditTrail(
  tenantId: string,
  opts: { entityId?: string; limit?: number } = {},
): Promise<AuditEntry[]> {
  let query = supabase
    .from("audit_log")
    .select(
      "id, action, entity_type, entity_id, actor_email, actor_role, detail, hash, prev_hash, created_at",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);

  if (opts.entityId) query = query.eq("entity_id", opts.entityId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actorEmail: row.actor_email,
    actorRole: row.actor_role,
    detail: row.detail,
    hash: row.hash,
    prevHash: row.prev_hash,
    createdAt: row.created_at,
  }));
}
