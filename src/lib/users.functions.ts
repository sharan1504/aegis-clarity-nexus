import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import type { Database } from "@/integrations/supabase/types";

const adminClient = () => {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Server invitation service is not configured.");
  return createClient<Database>(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
};
const allowedRoles = ["admin", "manager", "analyst", "viewer"] as const;
type AppRole = typeof allowedRoles[number];
const temporaryPassword = () => `AeG!${randomBytes(18).toString("base64url")}9`;

async function sendInvitationEmail(input: { to: string; fullName: string; organization: string; role: string; temporaryPassword: string; loginUrl: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AEGIS_EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Invitation email is not configured. Set RESEND_API_KEY and AEGIS_EMAIL_FROM before inviting users.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: "You're invited to Aegis AI",
      text: `Hi ${input.fullName},\n\nYou have been invited to join Aegis AI for ${input.organization}.\nRole: ${input.role}\n\nSign in: ${input.loginUrl}\nTemporary password: ${input.temporaryPassword}\n\nThis temporary password is for first-time access only. Aegis will require you to create a new password after signing in.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto"><h2>You're invited to Aegis AI</h2><p>Hi ${input.fullName},</p><p>You have been invited to join <strong>Aegis AI</strong> for <strong>${input.organization}</strong>.</p><p><strong>Role:</strong> ${input.role}</p><p><a href="${input.loginUrl}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;text-decoration:none;border-radius:6px">Open Aegis AI</a></p><p><strong>Temporary password</strong></p><p style="font-family:monospace;font-size:16px;background:#f3f4f6;padding:12px;border-radius:6px">${input.temporaryPassword}</p><p>This temporary password is for first-time access only. Aegis will require you to create a new password after signing in.</p></div>`,
    }),
  });
  if (!response.ok) throw new Error(`Invitation email could not be sent (${response.status}).`);
}

export const listTenantUsers = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: profile, error: profileError } = await context.supabase.from("profiles").select("tenant_id").eq("id", context.userId).single();
  if (profileError || !profile?.tenant_id) throw new Error("Unable to determine the current workspace.");
  const { data: members, error } = await context.supabase.from("profiles").select("id, tenant_id, email, full_name, created_at, updated_at").eq("tenant_id", profile.tenant_id).order("full_name", { ascending: true });
  if (error) throw new Error(`Unable to load workspace members: ${error.message}`);
  const { data: roles, error: rolesError } = await context.supabase.from("user_roles").select("user_id, role, tenant_id").eq("tenant_id", profile.tenant_id);
  if (rolesError) throw new Error(`Unable to load member roles: ${rolesError.message}`);
  const roleMap = new Map<string, string>();
  for (const role of roles ?? []) if (!roleMap.has(role.user_id)) roleMap.set(role.user_id, role.role);
  const admin = adminClient();
  const authUsers = (await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })).data?.users ?? [];
  const authMap = new Map(authUsers.map((u) => [u.id, u]));
  return { tenantId: profile.tenant_id, members: (members ?? []).map((member) => { const authUser = authMap.get(member.id); return { ...member, organization: typeof authUser?.user_metadata?.organization === "string" ? authUser.user_metadata.organization : null, role: roleMap.get(member.id) ?? "viewer", status: authUser?.email_confirmed_at ? "active" as const : "invited" as const }; }) };
});

export const inviteTenantUser = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { fullName: string; email: string; organization: string; role: string }) => ({ fullName: String(input.fullName ?? "").trim(), email: String(input.email ?? "").trim().toLowerCase(), organization: String(input.organization ?? "").trim(), role: String(input.role ?? "viewer").trim().toLowerCase() })).handler(async ({ data, context }) => {
  if (!data.fullName || !data.email || !data.organization) throw new Error("Full name, email, and organization are required.");
  if (!/^\S+@\S+\.\S+$/.test(data.email)) throw new Error("Enter a valid email address.");
  if (!allowedRoles.includes(data.role as AppRole)) throw new Error("Invalid role.");
  const { data: inviter, error: inviterError } = await context.supabase.from("profiles").select("tenant_id, full_name, email").eq("id", context.userId).single();
  if (inviterError || !inviter?.tenant_id) throw new Error("Unable to determine the current workspace.");
  const { data: inviterRole } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("tenant_id", inviter.tenant_id).in("role", ["admin", "manager"]).limit(1).maybeSingle();
  if (!inviterRole) throw new Error("Only workspace administrators and managers can invite users.");
  if (data.role === "admin" && inviterRole.role !== "admin") throw new Error("Only an administrator can invite another administrator.");

  const admin = adminClient();
  const request = getRequest();
  if (!request?.url) throw new Error("Application URL is not available for invitations.");
  const loginUrl = new URL("/auth", request.url).toString();
  const tempPassword = temporaryPassword();
  const { data: existingUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (existingUsers?.users.some((u) => u.email?.toLowerCase() === data.email)) throw new Error("A user with this email already exists.");

  const { data: created, error: createError } = await admin.auth.admin.createUser({ email: data.email, password: tempPassword, email_confirm: true, user_metadata: { full_name: data.fullName, organization: data.organization, invited_tenant_id: inviter.tenant_id, invited_role: data.role, force_password_change: true } });
  if (createError || !created.user) throw new Error(createError?.message ?? "User could not be created.");

  try {
    const { error: profileError } = await admin.from("profiles").upsert({ id: created.user.id, tenant_id: inviter.tenant_id, email: data.email, full_name: data.fullName });
    if (profileError) throw new Error(`Workspace membership could not be created: ${profileError.message}`);
    const { error: roleError } = await admin.from("user_roles").insert({ user_id: created.user.id, tenant_id: inviter.tenant_id, role: data.role as AppRole });
    if (roleError && !roleError.message.toLowerCase().includes("duplicate")) throw new Error(`Workspace role could not be created: ${roleError.message}`);
    await sendInvitationEmail({ to: data.email, fullName: data.fullName, organization: data.organization, role: data.role, temporaryPassword: tempPassword, loginUrl });
    await admin.from("audit_events").insert({ tenant_id: inviter.tenant_id, correlation_id: `invite_${created.user.id}`, actor_id: context.userId, actor_name: inviter.full_name ?? inviter.email ?? "Workspace administrator", actor_email: inviter.email ?? "", actor_role: inviterRole.role === "admin" ? "Admin" : "Manager", actor_type: "human", action: "user.added", resource_type: "user", resource_name: data.fullName, target_id: created.user.id, changes: [{ field: "membership", oldValue: null, newValue: `${data.role} (invited)` }], reason: "Workspace invitation sent", result: "success", risk: data.role === "admin" ? "high" : "low", source: { channel: "web" }, metadata: { email: data.email, organization: data.organization }, seeded: false });
  } catch (error) {
    await admin.from("user_roles").delete().eq("user_id", created.user.id).eq("tenant_id", inviter.tenant_id);
    await admin.from("profiles").delete().eq("id", created.user.id).eq("tenant_id", inviter.tenant_id);
    await admin.auth.admin.deleteUser(created.user.id);
    throw error;
  }
  return { ok: true as const, userId: created.user.id, email: data.email };
});
