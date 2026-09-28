import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";

const dbOf = (supabase: unknown) => supabase as any;
const divisionRoles = ["owner", "admin", "manager", "member", "viewer"] as const;
type DivisionRole = typeof divisionRoles[number];

async function requireAdmin(context: any) {
  const { tenantId } = await resolveTenant(context.supabase, context.userId);
  const { data: role } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("tenant_id", tenantId).eq("role", "admin").maybeSingle();
  if (!role) throw new Error("Only workspace administrators can manage organization structure.");
  return { tenantId };
}

export const listWorkspaceDivisions = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { tenantId } = await requireAdmin(context);
  const db = dbOf(context.supabase);
  const [{ data: divisions, error: divisionError }, { data: memberships, error: membershipError }, { data: users, error: userError }, { data: agents, error: agentError }, { data: agentAccess, error: agentAccessError }, { data: connections, error: connectionError }, { data: connectionAccess, error: connectionAccessError }] = await Promise.all([
    db.from("departments").select("id,department_key,display_name,description,active,parent_department_id,scope").eq("tenant_id", tenantId).order("display_name"),
    db.from("user_department_memberships").select("user_id,department_id,role").eq("tenant_id", tenantId),
    db.from("profiles").select("id,email,full_name").eq("tenant_id", tenantId).order("full_name"),
    db.from("agent_definitions").select("agent_key,display_name,category,description").order("display_name"),
    db.from("department_agent_access").select("department_id,agent_key,enabled").eq("tenant_id", tenantId),
    db.from("provider_connections").select("id,provider,display_name,environment,status,last_sync_at").eq("tenant_id", tenantId).order("updated_at", { ascending: false }),
    db.from("department_provider_connection_access").select("department_id,connection_id,enabled").eq("tenant_id", tenantId),
  ]);
  const error = [divisionError, membershipError, userError, agentError, agentAccessError, connectionError, connectionAccessError].find(Boolean);
  if (error) throw new Error(error.message);
  return { divisions: divisions ?? [], memberships: memberships ?? [], users: users ?? [], agents: agents ?? [], agentAccess: agentAccess ?? [], connections: connections ?? [], connectionAccess: connectionAccess ?? [] };
});

export const createWorkspaceDivision = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { name: string; key?: string; description?: string; parentDivisionId?: string | null }) => ({ name: String(input.name ?? "").trim(), key: String(input.key ?? "").trim().toLowerCase(), description: String(input.description ?? "").trim(), parentDivisionId: input.parentDivisionId ? String(input.parentDivisionId) : null })).handler(async ({ data, context }) => {
  const { tenantId } = await requireAdmin(context);
  if (!data.name) throw new Error("Division name is required.");
  const key = (data.key || data.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  if (!key) throw new Error("Enter a valid division name or key.");
  const db = dbOf(context.supabase);
  if (data.parentDivisionId) {
    const { data: parent } = await db.from("departments").select("id").eq("id", data.parentDivisionId).eq("tenant_id", tenantId).maybeSingle();
    if (!parent) throw new Error("Parent division does not belong to this workspace.");
  }
  const { data: created, error } = await db.from("departments").insert({ tenant_id: tenantId, department_key: key, display_name: data.name, description: data.description || null, parent_department_id: data.parentDivisionId, scope: {} }).select("id,department_key,display_name,description,active,parent_department_id,scope").single();
  if (error) throw new Error(error.message.includes("departments_tenant_key") ? "A division with this key already exists." : error.message);
  return { division: created };
});

export const updateWorkspaceDivision = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { id: string; name: string; key: string; description?: string; parentDivisionId?: string | null; active?: boolean; scope?: Record<string, unknown> }) => ({ id: String(input.id ?? "").trim(), name: String(input.name ?? "").trim(), key: String(input.key ?? "").trim().toLowerCase(), description: String(input.description ?? "").trim(), parentDivisionId: input.parentDivisionId ? String(input.parentDivisionId) : null, active: input.active !== false, scope: input.scope ?? {} })).handler(async ({ data, context }) => {
  const { tenantId } = await requireAdmin(context);
  if (!data.id || !data.name || !data.key) throw new Error("Division name and key are required.");
  if (data.parentDivisionId === data.id) throw new Error("A division cannot be its own parent.");
  const db = dbOf(context.supabase);
  if (data.parentDivisionId) {
    const { data: parent } = await db.from("departments").select("id").eq("id", data.parentDivisionId).eq("tenant_id", tenantId).maybeSingle();
    if (!parent) throw new Error("Parent division does not belong to this workspace.");
  }
  const { data: updated, error } = await db.from("departments").update({ display_name: data.name, department_key: data.key, description: data.description || null, parent_department_id: data.parentDivisionId, active: data.active, scope: data.scope }).eq("id", data.id).eq("tenant_id", tenantId).select("id,department_key,display_name,description,active,parent_department_id,scope").single();
  if (error) throw new Error(error.message);
  return { division: updated };
});

export const deleteWorkspaceDivision = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { id: string }) => ({ id: String(input.id ?? "").trim() })).handler(async ({ data, context }) => {
  const { tenantId } = await requireAdmin(context);
  const db = dbOf(context.supabase);
  const { data: children } = await db.from("departments").select("id").eq("tenant_id", tenantId).eq("parent_department_id", data.id).limit(1);
  if ((children ?? []).length) throw new Error("Move or delete child divisions before removing this division.");
  const { count } = await db.from("user_department_memberships").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("department_id", data.id);
  if ((count ?? 0) > 0) throw new Error("This division still has users. Reassign them before deleting it.");
  const { error } = await db.from("departments").delete().eq("id", data.id).eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  return { ok: true as const };
});

export const setDivisionUserAccess = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { userId: string; divisionId: string; role: string; enabled: boolean }) => ({ userId: String(input.userId ?? "").trim(), divisionId: String(input.divisionId ?? "").trim(), role: String(input.role ?? "member").trim().toLowerCase() as DivisionRole, enabled: Boolean(input.enabled) })).handler(async ({ data, context }) => {
  const { tenantId } = await requireAdmin(context);
  if (!data.userId || !data.divisionId) throw new Error("User and division are required.");
  if (!divisionRoles.includes(data.role)) throw new Error("Invalid division role.");
  const db = dbOf(context.supabase);
  const [{ data: user }, { data: division }] = await Promise.all([db.from("profiles").select("id").eq("id", data.userId).eq("tenant_id", tenantId).maybeSingle(), db.from("departments").select("id").eq("id", data.divisionId).eq("tenant_id", tenantId).maybeSingle()]);
  if (!user || !division) throw new Error("User or division does not belong to this workspace.");
  if (data.enabled) {
    const { error } = await db.from("user_department_memberships").upsert({ tenant_id: tenantId, user_id: data.userId, department_id: data.divisionId, role: data.role }, { onConflict: "tenant_id,user_id,department_id" });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db.from("user_department_memberships").delete().eq("tenant_id", tenantId).eq("user_id", data.userId).eq("department_id", data.divisionId);
    if (error) throw new Error(error.message);
  }
  return { ok: true as const };
});

export const setDivisionAgentAccess = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { divisionId: string; agentKey: string; enabled: boolean }) => ({ divisionId: String(input.divisionId ?? "").trim(), agentKey: String(input.agentKey ?? "").trim(), enabled: Boolean(input.enabled) })).handler(async ({ data, context }) => {
  const { tenantId } = await requireAdmin(context);
  const db = dbOf(context.supabase);
  if (data.enabled) {
    const { error } = await db.from("department_agent_access").upsert({ tenant_id: tenantId, department_id: data.divisionId, agent_key: data.agentKey, enabled: true }, { onConflict: "tenant_id,department_id,agent_key" });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db.from("department_agent_access").update({ enabled: false }).eq("tenant_id", tenantId).eq("department_id", data.divisionId).eq("agent_key", data.agentKey);
    if (error) throw new Error(error.message);
  }
  return { ok: true as const };
});

export const setDivisionConnectionAccess = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { divisionId: string; connectionId: string; enabled: boolean }) => ({ divisionId: String(input.divisionId ?? "").trim(), connectionId: String(input.connectionId ?? "").trim(), enabled: Boolean(input.enabled) })).handler(async ({ data, context }) => {
  const { tenantId } = await requireAdmin(context);
  const db = dbOf(context.supabase);
  const { data: connection } = await db.from("provider_connections").select("id").eq("id", data.connectionId).eq("tenant_id", tenantId).maybeSingle();
  if (!connection) throw new Error("Integration instance does not belong to this workspace.");
  if (data.enabled) {
    const { error } = await db.from("department_provider_connection_access").upsert({ tenant_id: tenantId, department_id: data.divisionId, connection_id: data.connectionId, enabled: true }, { onConflict: "tenant_id,department_id,connection_id" });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db.from("department_provider_connection_access").update({ enabled: false }).eq("tenant_id", tenantId).eq("department_id", data.divisionId).eq("connection_id", data.connectionId);
    if (error) throw new Error(error.message);
  }
  return { ok: true as const };
});

export const listWorkspaceGroups = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { tenantId } = await requireAdmin(context);
  const db = dbOf(context.supabase);
  const [{ data: groups, error: groupsError }, { data: members, error: membersError }, { data: users, error: usersError }, { data: divisions, error: divisionsError }] = await Promise.all([
    db.from("workspace_groups").select("id,department_id,name,description,owner_user_id,active,created_at,updated_at").eq("tenant_id", tenantId).order("name"),
    db.from("workspace_group_members").select("group_id,user_id,group_role").eq("tenant_id", tenantId),
    db.from("profiles").select("id,email,full_name").eq("tenant_id", tenantId).order("full_name"),
    db.from("departments").select("id,display_name").eq("tenant_id", tenantId).eq("active", true).order("display_name"),
  ]);
  const error = [groupsError, membersError, usersError, divisionsError].find(Boolean);
  if (error) throw new Error(error.message);
  return { groups: groups ?? [], members: members ?? [], users: users ?? [], divisions: divisions ?? [] };
});

export const createWorkspaceGroup = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { name: string; description?: string; divisionId: string; ownerUserId?: string | null }) => ({ name: String(input.name ?? "").trim(), description: String(input.description ?? "").trim(), divisionId: String(input.divisionId ?? "").trim(), ownerUserId: input.ownerUserId ? String(input.ownerUserId) : null })).handler(async ({ data, context }) => {
  const { tenantId } = await requireAdmin(context);
  if (!data.name || !data.divisionId) throw new Error("Group name and division are required.");
  const db = dbOf(context.supabase);
  const { data: division } = await db.from("departments").select("id").eq("id", data.divisionId).eq("tenant_id", tenantId).maybeSingle();
  if (!division) throw new Error("Division does not belong to this workspace.");
  const { data: group, error } = await db.from("workspace_groups").insert({ tenant_id: tenantId, department_id: data.divisionId, name: data.name, description: data.description || null, owner_user_id: data.ownerUserId }).select("id,department_id,name,description,owner_user_id,active,created_at,updated_at").single();
  if (error) throw new Error(error.message.includes("workspace_groups_tenant_id_department_id_name_key") ? "A group with this name already exists in the selected division." : error.message);
  if (data.ownerUserId) await db.from("workspace_group_members").upsert({ tenant_id: tenantId, group_id: group.id, user_id: data.ownerUserId, group_role: "owner" }, { onConflict: "tenant_id,group_id,user_id" });
  return { group };
});

export const updateWorkspaceGroupMembers = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { groupId: string; userIds: string[] }) => ({ groupId: String(input.groupId ?? "").trim(), userIds: Array.isArray(input.userIds) ? input.userIds.map(String) : [] })).handler(async ({ data, context }) => {
  const { tenantId } = await requireAdmin(context);
  const db = dbOf(context.supabase);
  const { data: group } = await db.from("workspace_groups").select("id,department_id").eq("id", data.groupId).eq("tenant_id", tenantId).maybeSingle();
  if (!group) throw new Error("Group does not belong to this workspace.");
  if (data.userIds.length) {
    const { data: memberships } = await db.from("user_department_memberships").select("user_id").eq("tenant_id", tenantId).eq("department_id", group.department_id).in("user_id", data.userIds);
    const allowed = new Set((memberships ?? []).map((row: any) => row.user_id));
    if (allowed.size !== data.userIds.length) throw new Error("Every group member must first belong to the group's division.");
  }
  await db.from("workspace_group_members").delete().eq("tenant_id", tenantId).eq("group_id", data.groupId);
  if (data.userIds.length) {
    const { error } = await db.from("workspace_group_members").insert(data.userIds.map((userId) => ({ tenant_id: tenantId, group_id: data.groupId, user_id: userId, group_role: "member" })));
    if (error) throw new Error(error.message);
  }
  return { ok: true as const };
});

export const deleteWorkspaceGroup = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { id: string }) => ({ id: String(input.id ?? "").trim() })).handler(async ({ data, context }) => {
  const { tenantId } = await requireAdmin(context);
  const { error } = await dbOf(context.supabase).from("workspace_groups").delete().eq("id", data.id).eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  return { ok: true as const };
});

export const updatePrivacySettings = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { maskPii: boolean; allowAiProviderData: boolean; redactSecrets: boolean; aiActivityRetentionDays: number }) => ({ maskPii: Boolean(input.maskPii), allowAiProviderData: Boolean(input.allowAiProviderData), redactSecrets: Boolean(input.redactSecrets), aiActivityRetentionDays: Math.max(7, Math.min(3650, Number(input.aiActivityRetentionDays) || 90)) })).handler(async ({ data, context }) => {
  const { tenantId } = await requireAdmin(context);
  const db = dbOf(context.supabase);
  const { data: current, error: readError } = await db.from("tenants").select("analytics_settings").eq("id", tenantId).single();
  if (readError) throw new Error(readError.message);
  const currentSettings = current?.analytics_settings && typeof current.analytics_settings === "object" ? current.analytics_settings : {};
  const next = { ...currentSettings, privacy: data };
  const { error } = await db.from("tenants").update({ analytics_settings: next }).eq("id", tenantId);
  if (error) throw new Error(error.message);
  return { privacy: data };
});

export { divisionRoles };
