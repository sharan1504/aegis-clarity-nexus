import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";

export type DashboardConfig = { widgets: string[] };

const db = (supabase: any) => supabase as any;

export const listCustomDashboards = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { tenantId } = await resolveTenant(context.supabase, context.userId);
  const { data, error } = await db(context.supabase).from("custom_dashboards").select("id,name,starred,config,created_at,updated_at").eq("tenant_id", tenantId).eq("user_id", context.userId).order("starred", { ascending: false }).order("updated_at", { ascending: false });
  if (error) throw error;
  return { dashboards: (data ?? []).map((row: any) => ({ id: row.id, name: row.name, starred: Boolean(row.starred), config: (row.config ?? { widgets: [] }) as DashboardConfig, createdAt: row.created_at, updatedAt: row.updated_at })) };
});

export const createCustomDashboard = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { name: string; widgets: string[] }) => ({ name: input.name.trim().slice(0, 80), widgets: [...new Set(input.widgets)].slice(0, 12) })).handler(async ({ data, context }) => {
  if (!data.name) throw new Error("Dashboard name is required.");
  const { tenantId } = await resolveTenant(context.supabase, context.userId);
  const { data: row, error } = await db(context.supabase).from("custom_dashboards").insert({ tenant_id: tenantId, user_id: context.userId, name: data.name, config: { widgets: data.widgets } }).select("id,name,starred,config,created_at,updated_at").single();
  if (error || !row) throw error ?? new Error("Could not create dashboard.");
  await context.supabase.from("audit_log").insert({ tenant_id: tenantId, actor_id: context.userId, action: "dashboard.created", entity_type: "custom_dashboard", entity_id: row.id, detail: `Created custom dashboard ${row.name}.`, payload: { widgets: data.widgets } });
  return { id: row.id, name: row.name };
});

export const toggleCustomDashboardStar = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { id: string; starred: boolean }) => ({ id: String(input.id), starred: Boolean(input.starred) })).handler(async ({ data, context }) => {
  const { tenantId } = await resolveTenant(context.supabase, context.userId);
  const { error } = await db(context.supabase).from("custom_dashboards").update({ starred: data.starred, updated_at: new Date().toISOString() }).eq("id", data.id).eq("tenant_id", tenantId).eq("user_id", context.userId);
  if (error) throw error;
  return { ok: true };
});

export const deleteCustomDashboard = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { id: string }) => ({ id: String(input.id) })).handler(async ({ data, context }) => {
  const { tenantId } = await resolveTenant(context.supabase, context.userId);
  const { error } = await db(context.supabase).from("custom_dashboards").delete().eq("id", data.id).eq("tenant_id", tenantId).eq("user_id", context.userId);
  if (error) throw error;
  await context.supabase.from("audit_log").insert({ tenant_id: tenantId, actor_id: context.userId, action: "dashboard.deleted", entity_type: "custom_dashboard", entity_id: data.id, detail: "Deleted personal custom dashboard." });
  return { ok: true };
});
