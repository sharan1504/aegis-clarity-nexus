import crypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";
import { getAdminClient } from "./oauth-framework.server";
import { encryptCredentials } from "./credential-vault.server";
import { googleServiceAccountToken, type GoogleServiceAccount } from "./google-service-account.server";

export const GOOGLE_WORKSPACE_SCOPES = ["https://www.googleapis.com/auth/admin.directory.user.readonly", "https://www.googleapis.com/auth/admin.directory.group.readonly"];

export async function connectGoogleWorkspace(input: { tenantId: string; userId: string; connectionId?: string; clientEmail: string; privateKey: string; delegatedAdminEmail: string; displayName?: string; environment?: string }) {
  const serviceAccount: GoogleServiceAccount = { clientEmail: input.clientEmail.trim(), privateKey: input.privateKey.replace(/\\n/g, "\n") };
  const subject = input.delegatedAdminEmail.trim(); if (!serviceAccount.clientEmail || !serviceAccount.privateKey || !subject) throw new Error("Google Workspace service-account email, private key and delegated admin email are required.");
  const token = await googleServiceAccountToken({ serviceAccount, scopes: GOOGLE_WORKSPACE_SCOPES, subject });
  const response = await fetch("https://admin.googleapis.com/admin/directory/v1/users?maxResults=1&orderBy=email", { headers: { authorization: `Bearer ${token.accessToken}`, accept: "application/json" } });
  const text = await response.text(); if (!response.ok) throw new Error(`Google Workspace validation failed (${response.status}): ${text.slice(0, 300)}`);
  const db = await getAdminClient(); const connectionId = input.connectionId ?? crypto.randomUUID(); const displayName = input.displayName?.trim() || `Google Workspace (${subject})`;
  const { error } = await db.from("provider_connections").upsert({ id: connectionId, tenant_id: input.tenantId, provider: "google-workspace", external_id: subject, display_name: displayName, environment: input.environment ?? "Production", status: "connected", encrypted_credentials: encryptCredentials({ ...serviceAccount, delegatedAdminEmail: subject, accessToken: token.accessToken, expiresAt: token.expiresAt, scopes: GOOGLE_WORKSPACE_SCOPES }), credential_expires_at: token.expiresAt, last_error: null, connected_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_by: input.userId }, { onConflict: "id" });
  if (error) throw new Error(`Unable to store Google Workspace connection: ${error.message}`);
  return { connectionId, displayName };
}

export const startGoogleWorkspaceConnection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId?: string; clientEmail: string; privateKey: string; delegatedAdminEmail: string; displayName?: string; environment?: string }) => input).handler(async ({ data, context }) => { const { tenantId, roles } = await resolveTenant(context.supabase, context.userId); if (!roles.includes("admin") && !roles.includes("manager")) throw new Error("Admin/manager access is required to connect an integration."); return connectGoogleWorkspace({ tenantId, userId: context.userId, ...data }); });
