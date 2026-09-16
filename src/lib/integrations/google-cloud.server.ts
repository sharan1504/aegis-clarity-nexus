import crypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";
import { getAdminClient, readConnectionCredentials, markReconnectRequired } from "./oauth-framework.server";
import { encryptCredentials } from "./credential-vault.server";
import { googleServiceAccountToken, type GoogleServiceAccount } from "./google-service-account.server";

const SCOPES = ["https://www.googleapis.com/auth/cloud-platform"] as const;
const RESOURCE_MANAGER_BASE = "https://cloudresourcemanager.googleapis.com/v1";

async function getToken(credentials: GoogleServiceAccount) {
  return googleServiceAccountToken({ serviceAccount: credentials, scopes: [...SCOPES] });
}

async function validateProject(projectId: string, accessToken: string) {
  const response = await fetch(`${RESOURCE_MANAGER_BASE}/projects/${encodeURIComponent(projectId)}`, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Google Cloud validation failed (${response.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text) as { projectId?: string; name?: string; lifecycleState?: string };
}

export async function connectGoogleCloud(input: { tenantId: string; userId: string; connectionId?: string; clientEmail: string; privateKey: string; projectId: string; displayName?: string; environment?: string }) {
  const serviceAccount: GoogleServiceAccount = {
    clientEmail: input.clientEmail.trim(),
    privateKey: input.privateKey.replace(/\\n/g, "\n"),
    projectId: input.projectId.trim(),
  };
  if (!serviceAccount.clientEmail || !serviceAccount.privateKey || !serviceAccount.projectId) throw new Error("Google Cloud service-account email, private key and project ID are required.");
  const token = await getToken(serviceAccount);
  const project = await validateProject(serviceAccount.projectId, token.accessToken);
  const db = await getAdminClient();
  const connectionId = input.connectionId ?? crypto.randomUUID();
  const displayName = input.displayName?.trim() || project.name || serviceAccount.projectId;
  const { error } = await db.from("provider_connections").upsert({
    id: connectionId,
    tenant_id: input.tenantId,
    provider: "gcp",
    external_id: project.projectId ?? serviceAccount.projectId,
    display_name: displayName,
    environment: input.environment ?? "Production",
    status: "connected",
    encrypted_credentials: encryptCredentials({ ...serviceAccount, scopes: [...SCOPES] }),
    credential_expires_at: null,
    last_error: null,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: input.userId,
  }, { onConflict: "id" });
  if (error) throw new Error(`Unable to store Google Cloud connection: ${error.message}`);
  return { connectionId, displayName };
}

export async function ensureGoogleCloudAccessToken(connectionId: string, tenantId: string) {
  const db = await getAdminClient();
  const credentials = await readConnectionCredentials<GoogleServiceAccount & { scopes?: string[] }>(db, connectionId, tenantId);
  try {
    const token = await getToken(credentials);
    return token.accessToken;
  } catch (error) {
    await markReconnectRequired(db, connectionId, "Google Cloud service-account authentication failed. Reconnect required.");
    throw error;
  }
}

export const startGoogleCloudConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { connectionId?: string; clientEmail: string; privateKey: string; projectId: string; displayName?: string; environment?: string }) => input)
  .handler(async ({ data, context }) => {
    const { tenantId, roles } = await resolveTenant(context.supabase, context.userId);
    if (!roles.includes("admin") && !roles.includes("manager")) throw new Error("Admin/manager access is required to connect an integration.");
    return connectGoogleCloud({ tenantId, userId: context.userId, ...data });
  });
