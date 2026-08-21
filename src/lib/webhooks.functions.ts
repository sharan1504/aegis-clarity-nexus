import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";

const EVENT_TYPES = [
  "change.approved",
  "change.rejected",
  "change.rollback_initiated",
  "ticket.created",
  "role.changed",
  "integration.sync_failed",
] as const;

function requireAdmin(roles: string[]) {
  if (!roles.includes("admin")) throw new Error("Only workspace administrators can manage webhooks.");
}

function generateSecret() {
  return `aegis_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

export const listWebhooks = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { tenantId, roles } = await resolveTenant(context.supabase, context.userId);
  requireAdmin(roles);
  const { data, error } = await context.supabase
    .from("webhooks")
    .select("id,target_url,event_types,enabled,created_at,updated_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((row) => row.id);
  const attempts = ids.length
    ? await context.supabase.from("webhook_delivery_attempts").select("id,webhook_id,event_type,attempt,status_code,success,error_message,attempted_at,next_retry_at").eq("tenant_id", tenantId).in("webhook_id", ids).order("attempted_at", { ascending: false }).limit(100)
    : { data: [], error: null };
  if (attempts.error) throw new Error(attempts.error.message);
  return { eventTypes: EVENT_TYPES, webhooks: data ?? [], attempts: attempts.data ?? [] };
});

export const createWebhook = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { targetUrl: string; eventTypes: string[] }) => input).handler(async ({ data, context }) => {
  const { tenantId, roles } = await resolveTenant(context.supabase, context.userId);
  requireAdmin(roles);
  const targetUrl = String(data.targetUrl ?? "").trim();
  if (!/^https:\/\//i.test(targetUrl)) throw new Error("Webhook target URL must use HTTPS.");
  const eventTypes = [...new Set((data.eventTypes ?? []).filter((event) => (EVENT_TYPES as readonly string[]).includes(event)))];
  if (!eventTypes.length) throw new Error("Select at least one supported event type.");
  const secret = generateSecret();
  const { data: row, error } = await context.supabase.from("webhooks").insert({ tenant_id: tenantId, target_url: targetUrl, secret, event_types: eventTypes, enabled: true }).select("id,target_url,event_types,enabled,created_at").single();
  if (error || !row) throw new Error(error?.message ?? "Webhook could not be created.");
  return { webhook: row, secret };
});

export const deleteWebhook = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { id: string }) => input).handler(async ({ data, context }) => {
  const { tenantId, roles } = await resolveTenant(context.supabase, context.userId);
  requireAdmin(roles);
  const { error } = await context.supabase.from("webhooks").delete().eq("id", data.id).eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  return { ok: true as const };
});
