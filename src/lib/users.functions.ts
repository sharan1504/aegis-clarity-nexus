import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const adminClient = () => {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Server invitation service is not configured.");
  return createClient<Database>(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
};

const allowedRoles = ["admin", "manager", "analyst", "viewer"] as const;
type AppRole = typeof allowedRoles[number];

export const listTenantUsers = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: profile, error: profileError } = await context.supabase.from("profiles").select("tenant_id").eq("id", context.userId).single();
  if (profileError || !profile?.tenant_id) throw new Error("Unable to determine the current workspace.");
  const { data: members, error } = await context.supabase.from("profiles").select("id, tenant_id, email, full_name, created_at, updated_at").eq("tenant_id", profile.tenant_id).order("full_name", { ascending: true });
  if (error) throw new Error(`Unable to load workspace members: ${error.message}`);
  const { data: roles, error: rolesError } = await context.supabase.from("user_roles").select("user_id, role, tenant_id").eq("tenant_id", profile.tenant_id);
  if (rolesError) throw new Error(`Unable to load member roles: ${rolesError.message}`);
  const roleMap = new Map<string, string>(); for (const role of roles ?? []) if (!roleMap.has(role.user_id)) roleMap.set(role.user_id, role.role);
  const admin = adminClient();
  const authUsers = (await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })).data?.users ?? [];
  const authMap = new Map(authUsers.map((u) => [u.id, u]));
  return { tenantId: profile.tenant_id, members: (members ?? []).map((member) => { const authUser = authMap.get(member.id); return { ...member, organization: typeof authUser?.user_metadata?.organization === "string" ? authUser.user_metadata.organization : null, role: roleMap.get(member.id) ?? "viewer", status: authUser?.email_confirmed_at ? "active" as const : "invited" as const }; }) };
});

export const inviteTenantUser = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { fullName: string; email: string; organization: string; role: string }) => ({ fullName: String(input.fullName ?? "").trim(), email: String(input.email ?? "").trim().toLowerCase(), organization: String(input.organization ?? "").trim(), role: String(input.role ?? "viewer").trim().toLowerCase() })).handler(async ({ data, context }) => {
  if (!data.fullName || !data.email || !data.organization) throw new Error("Full name, email, and organization are required.");
  if (!/^\S+@\S+\.\S+$/.test(data.email)) throw new Error("Enter a valid email address.");
  if (!allowedRoles.includes(data.role as AppRole)) throw new Error("Invalid role.");
  const { data: inviter, error: inviterError } = await context.supabase.from("profiles").select("tenant_id").eq("id", context.userId).single();
  if (inviterError || !inviter?.tenant_id) throw new Error("Unable to determine the current workspace.");
  const { data: inviterRole } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("tenant_id", inviter.tenant_id).in("role", ["admin", "manager"]).limit(1).maybeSingle();
  if (!inviterRole) throw new Error("Only workspace administrators and managers can invite users.");
  if (data.role === "admin" && inviterRole.role !== "admin") throw new Error("Only an administrator can invite another administrator.");

  const admin = adminClient();
  const appUrl = process.env.APP_URL ?? process.env.VITE_APP_URL;
  if (!appUrl) throw new Error("Application URL is not configured for invitations.");
  const redirectTo = `${appUrl.replace(/\/$/, "")}/auth/accept-invite`;

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(data.email, {
    redirectTo,
    data: { full_name: data.fullName, organization: data.organization, invited_tenant_id: inviter.tenant_id, invited_role: data.role },
  });
  if (inviteError || !invited.user) throw new Error(inviteError?.message ?? "Invitation could not be sent.");
  const { error: profileError } = await admin.from("profiles").upsert({ id: invited.user.id, tenant_id: inviter.tenant_id, email: data.email, full_name: data.fullName });
  if (profileError) throw new Error(`Invitation sent, but workspace membership could not be created: ${profileError.message}`);
  const { error: roleError } = await admin.from("user_roles").insert({ user_id: invited.user.id, tenant_id: inviter.tenant_id, role: data.role as AppRole });
  if (roleError && !roleError.message.toLowerCase().includes("duplicate")) throw new Error(`Invitation sent, but the workspace role could not be created: ${roleError.message}`);
  return { ok: true as const, userId: invited.user.id, email: data.email };
});
