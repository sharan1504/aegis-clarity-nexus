import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";

const dbOf = (supabase: unknown) => supabase as any;

async function requireAdmin(context: any) {
  const { tenantId } = await resolveTenant(context.supabase, context.userId);
  const { data: role } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("tenant_id", tenantId).eq("role", "admin").maybeSingle();
  if (!role) throw new Error("Only workspace administrators can manage department access.");
  return { tenantId };
}

export const getDepartmentAdminView = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { tenantId } = await requireAdmin(context);
  const db = dbOf(context.supabase);
  const [{ data: departments, error: departmentError }, { data: members, error: memberError }, { data: roles, error: roleError }, { data: agents, error: agentError }, { data: access, error: accessError }, { data: connections, error: connectionError }, { data: connectionAccess, error: connectionAccessError }] = await Promise.all([
    db.from("departments").select("id,department_key,display_name,description,active").eq("active", true).order("display_name"),
    db.from("profiles").select("id,email,full_name").eq("tenant_id", tenantId).order("full_name"),
    db.from("user_roles").select("user_id,role").eq("tenant_id", tenantId),
    db.from("agent_definitions").select("agent_key,display_name,category,description").order("display_name"),
    db.from("department_agent_access").select("department_id,agent_key,enabled").eq("tenant_id", tenantId),
    db.from("provider_connections").select("id,provider,display_name,environment,status,external_id,last_sync_at").eq("tenant_id", tenantId).order("updated_at", { ascending: false }),
    db.from("department_provider_connection_access").select("department_id,connection_id,enabled").eq("tenant_id", tenantId),
  ]);
  if (departmentError || memberError || roleError || agentError || accessError || connectionError || connectionAccessError) throw new Error([departmentError, memberError, roleError, agentError, accessError, connectionError, connectionAccessError].find(Boolean)?.message ?? "Department settings could not be loaded.");

  const { data: memberships, error: membershipError } = await db.from("user_department_memberships").select("user_id,department_id").eq("tenant_id", tenantId);
  if (membershipError) throw new Error(membershipError.message);
  const roleMap = new Map((roles ?? []).map((row: any) => [row.user_id, row.role]));
  return {
    departments: departments ?? [],
    members: (members ?? []).map((member: any) => ({ ...member, role: roleMap.get(member.id) ?? "viewer", departmentIds: (memberships ?? []).filter((row: any) => row.user_id === member.id).map((row: any) => row.department_id) })),
    agents: agents ?? [],
    access: access ?? [],
    connections: connections ?? [],
    connectionAccess: connectionAccess ?? [],
  };
});

export const setUserDepartmentMemberships = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { userId: string; departmentIds: string[] }) => ({ userId: String(input.userId ?? "").trim(), departmentIds: Array.isArray(input.departmentIds) ? input.departmentIds.map(String) : [] })).handler(async ({ data, context }) => {
  const { tenantId } = await requireAdmin(context);
  if (!data.userId) throw new Error("User ID is required.");
  const db = dbOf(context.supabase);
  const { data: target } = await db.from("profiles").select("id").eq("id", data.userId).eq("tenant_id", tenantId).maybeSingle();
  if (!target) throw new Error("User is not a member of this workspace.");
  const { data: validDepartments } = await db.from("departments").select("id").in("id", data.departmentIds).eq("active", true);
  const validIds = (validDepartments ?? []).map((row: any) => row.id);
  await db.from("user_department_memberships").delete().eq("tenant_id", tenantId).eq("user_id", data.userId);
  if (validIds.length) {
    const { error } = await db.from("user_department_memberships").insert(validIds.map((departmentId: string) => ({ tenant_id: tenantId, user_id: data.userId, department_id: departmentId })));
    if (error) throw new Error(error.message);
  }
  return { ok: true as const };
});

export const setDepartmentAgentAccess = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { departmentId: string; agentKey: string; enabled: boolean }) => ({ departmentId: String(input.departmentId ?? "").trim(), agentKey: String(input.agentKey ?? "").trim(), enabled: Boolean(input.enabled) })).handler(async ({ data, context }) => {
  const { tenantId } = await requireAdmin(context);
  if (!data.departmentId || !data.agentKey) throw new Error("Department and agent are required.");
  const db = dbOf(context.supabase);
  if (data.enabled) {
    const { error } = await db.from("department_agent_access").upsert({ tenant_id: tenantId, department_id: data.departmentId, agent_key: data.agentKey, enabled: true }, { onConflict: "tenant_id,department_id,agent_key" });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db.from("department_agent_access").update({ enabled: false }).eq("tenant_id", tenantId).eq("department_id", data.departmentId).eq("agent_key", data.agentKey);
    if (error) throw new Error(error.message);
  }
  return { ok: true as const };
});

export const setDepartmentProviderConnectionAccess = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { departmentId: string; connectionId: string; enabled: boolean }) => ({ departmentId: String(input.departmentId ?? "").trim(), connectionId: String(input.connectionId ?? "").trim(), enabled: Boolean(input.enabled) })).handler(async ({ data, context }) => {
  const { tenantId } = await requireAdmin(context);
  if (!data.departmentId || !data.connectionId) throw new Error("Department and integration instance are required.");
  const db = dbOf(context.supabase);
  const { data: connection } = await db.from("provider_connections").select("id").eq("id", data.connectionId).eq("tenant_id", tenantId).maybeSingle();
  if (!connection) throw new Error("Integration instance does not belong to this workspace.");
  if (data.enabled) {
    const { error } = await db.from("department_provider_connection_access").upsert({ tenant_id: tenantId, department_id: data.departmentId, connection_id: data.connectionId, enabled: true }, { onConflict: "tenant_id,department_id,connection_id" });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db.from("department_provider_connection_access").update({ enabled: false }).eq("tenant_id", tenantId).eq("department_id", data.departmentId).eq("connection_id", data.connectionId);
    if (error) throw new Error(error.message);
  }
  return { ok: true as const };
});
