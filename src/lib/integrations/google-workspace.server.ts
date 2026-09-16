import crypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";
import { getAdminClient, readConnectionCredentials } from "./oauth-framework.server";
import { encryptCredentials } from "./credential-vault.server";
import { googleServiceAccountToken, type GoogleServiceAccount } from "./google-service-account.server";

export const GOOGLE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.user.readonly",
  "https://www.googleapis.com/auth/admin.directory.group.readonly",
];

type GoogleWorkspaceCredentials = GoogleServiceAccount & {
  delegatedAdminEmail: string;
  scopes: string[];
};

function normalizeServiceAccount(clientEmail: string, privateKey: string, delegatedAdminEmail: string): GoogleWorkspaceCredentials {
  const credentials = {
    clientEmail: clientEmail.trim(),
    privateKey: privateKey.replace(/\\n/g, "\n"),
    delegatedAdminEmail: delegatedAdminEmail.trim(),
    scopes: GOOGLE_WORKSPACE_SCOPES,
  };
  if (!credentials.clientEmail || !credentials.privateKey || !credentials.delegatedAdminEmail) {
    throw new Error("Google Workspace service-account email, private key and delegated admin email are required.");
  }
  return credentials;
}

export async function ensureGoogleWorkspaceAccessToken(input: { connectionId: string; tenantId: string }) {
  const db = await getAdminClient();
  const credentials = await readConnectionCredentials<GoogleWorkspaceCredentials>(db, input.connectionId, input.tenantId);
  const token = await googleServiceAccountToken({
    serviceAccount: credentials,
    scopes: credentials.scopes,
    subject: credentials.delegatedAdminEmail,
  });
  return token.accessToken;
}

export async function connectGoogleWorkspace(input: {
  tenantId: string;
  userId: string;
  connectionId?: string;
  clientEmail: string;
  privateKey: string;
  delegatedAdminEmail: string;
  displayName?: string;
  environment?: string;
}) {
  const serviceAccount = normalizeServiceAccount(input.clientEmail, input.privateKey, input.delegatedAdminEmail);
  const token = await googleServiceAccountToken({
    serviceAccount,
    scopes: GOOGLE_WORKSPACE_SCOPES,
    subject: serviceAccount.delegatedAdminEmail,
  });
  const response = await fetch("https://admin.googleapis.com/admin/directory/v1/users?maxResults=1&orderBy=email", {
    headers: { authorization: `Bearer ${token.accessToken}`, accept: "application/json" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Google Workspace validation failed (${response.status}): ${text.slice(0, 300)}`);

  const db = await getAdminClient();
  const connectionId = input.connectionId ?? crypto.randomUUID();
  const displayName = input.displayName?.trim() || `Google Workspace (${serviceAccount.delegatedAdminEmail})`;
  const { error } = await db.from("provider_connections").upsert({
    id: connectionId,
    tenant_id: input.tenantId,
    provider: "google-workspace",
    external_id: serviceAccount.delegatedAdminEmail,
    display_name: displayName,
    environment: input.environment ?? "Production",
    status: "connected",
    encrypted_credentials: encryptCredentials(serviceAccount),
    credential_expires_at: null,
    last_error: null,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: input.userId,
  }, { onConflict: "id" });
  if (error) throw new Error(`Unable to store Google Workspace connection: ${error.message}`);
  return { connectionId, displayName };
}

export const startGoogleWorkspaceConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    connectionId?: string;
    clientEmail: string;
    privateKey: string;
    delegatedAdminEmail: string;
    displayName?: string;
    environment?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    const { tenantId, roles } = await resolveTenant(context.supabase, context.userId);
    if (!roles.includes("admin") && !roles.includes("manager")) throw new Error("Admin/manager access is required to connect an integration.");
    return connectGoogleWorkspace({ tenantId, userId: context.userId, ...data });
  });
