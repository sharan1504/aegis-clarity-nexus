import crypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";
import { getAdminClient, storeOAuthConnection, markReconnectRequired } from "./oauth-framework.server";
import { encryptCredentials } from "./credential-vault.server";

const API_BASE_URL = "https://api.security.microsoft.com";
const RESOURCE_SCOPE = "https://api.security.microsoft.com/.default";

type DefenderCredentials = { tenantId: string; clientId: string; clientSecret: string; accessToken?: string; expiresAt?: string };

async function tokenRequest(input: DefenderCredentials) {
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(input.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: input.clientId, client_secret: input.clientSecret, scope: RESOURCE_SCOPE }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Microsoft Defender OAuth failed (${response.status}): ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as any;
  if (!json.access_token) throw new Error("Microsoft Entra did not return a Defender access token.");
  return { accessToken: json.access_token as string, expiresAt: new Date(Date.now() + Number(json.expires_in ?? 3600) * 1000).toISOString() };
}

async function validateAccess(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/api/incidents?$top=1`, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Microsoft Defender validation failed (${response.status}): ${text.slice(0, 300)}`);
}

export async function connectDefender(input: { tenantId: string; userId: string; connectionId?: string; clientId: string; clientSecret: string; customerTenantId?: string; displayName?: string; environment?: string }) {
  const targetTenantId = input.customerTenantId?.trim() || input.tenantId;
  const credentials = { tenantId: targetTenantId, clientId: input.clientId.trim(), clientSecret: input.clientSecret };
  if (!credentials.tenantId || !credentials.clientId || !credentials.clientSecret) throw new Error("Microsoft Defender tenant ID, client ID and client secret are required.");
  const tokens = await tokenRequest(credentials);
  await validateAccess(tokens.accessToken);
  const db = await getAdminClient();
  const connectionId = input.connectionId ?? crypto.randomUUID();
  const displayName = input.displayName?.trim() || "Microsoft Defender";
  const { error } = await db.from("provider_connections").upsert({ id: connectionId, tenant_id: input.tenantId, provider: "microsoft-defender", external_id: targetTenantId, display_name: displayName, environment: input.environment ?? "Production", status: "connected", encrypted_credentials: encryptCredentials({ ...credentials, ...tokens }), credential_expires_at: tokens.expiresAt, last_error: null, connected_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_by: input.userId }, { onConflict: "id" });
  if (error) throw new Error(`Unable to store Microsoft Defender connection: ${error.message}`);
  return { connectionId, displayName, tenantId: targetTenantId };
}

export async function ensureDefenderAccessToken(connectionId: string, tenantId: string) {
  const db = await getAdminClient();
  const { readConnectionCredentials } = await import("./oauth-framework.server");
  const credentials = await readConnectionCredentials<DefenderCredentials>(db, connectionId, tenantId);
  if (credentials.accessToken && credentials.expiresAt && new Date(credentials.expiresAt).getTime() - Date.now() > 120_000) return credentials.accessToken;
  try {
    const tokens = await tokenRequest(credentials);
    await storeOAuthConnection(db, { connectionId, tenantId, provider: "microsoft-defender", externalId: credentials.tenantId, displayName: "Microsoft Defender", credentials: { ...credentials, ...tokens }, expiresAt: tokens.expiresAt });
    return tokens.accessToken;
  } catch (error) {
    await markReconnectRequired(db, connectionId, "Microsoft Defender token renewal failed. Reconnect required.");
    throw error;
  }
}

export const startDefenderConnection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId?: string; clientId: string; clientSecret: string; customerTenantId?: string; displayName?: string; environment?: string }) => input).handler(async ({ data, context }) => { const { tenantId, roles } = await resolveTenant(context.supabase, context.userId); if (!roles.includes("admin") && !roles.includes("manager")) throw new Error("Admin/manager access is required to connect an integration."); return connectDefender({ tenantId, userId: context.userId, ...data }); });
