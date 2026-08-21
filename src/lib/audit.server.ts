import type { UserClient } from "@/lib/execution/gateway.server";
import type { Json } from "@/integrations/supabase/types";

export async function writeAuditServer(supabase: UserClient, input: { tenantId: string; action: string; entityType: string; entityId?: string; detail?: string; payload?: Record<string, unknown> }) {
  const { error } = await supabase.from("audit_log").insert({ tenant_id: input.tenantId, action: input.action, entity_type: input.entityType, entity_id: input.entityId ?? null, detail: input.detail ?? null, payload: (input.payload ?? {}) as unknown as Json });
  if (error) throw error;
}
