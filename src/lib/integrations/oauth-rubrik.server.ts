import crypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";
import { getAdminClient, storeOAuthConnection, markReconnectRequired } from "./oauth-framework.server";
import { encryptCredentials } from "./credential-vault.server";

export type RubrikCredentials = { clientId: string; clientSecret: string; accessTokenUri: string; accessToken?: string; expiresAt?: string };

async function tokenRequest(input: RubrikCredentials) {
  const response = await fetch(input.accessTokenUri, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: input.clientId, client_secret: input.clientSecret }) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Rubrik Security Cloud authentication failed (${response.status}): ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as any;
  const accessToken = json.access_token ?? json.accessToken;
  if (!accessToken) throw new Error("Rubrik did not return an access token.");
  const expiresAt = json.expires_in ? new Date(Date.now() + Number(json.expires_in) * 1000).toISOString() : undefined;
  return { accessToken, expiresAt };
}

export async function connectRubrik(input: { tenantId: string; userId: string; connectionId?: string; clientId: string; clientSecret: string; accessTokenUri: string; displayName?: string; environment?: string }) {
  const uri = new URL(input.accessTokenUri.trim());
  if (uri.protocol !== "https:") throw new Error("Rubrik access token URI must use HTTPS.");
  const tokens = await tokenRequest({ clientId: input.clientId.trim(), clientSecret: input.clientSecret, accessTokenUri: uri.toString() });
  const db = await getAdminClient(); const connectionId = input.connectionId ?? crypto.randomUUID();
  const displayName = input.displayName?.trim() || "Rubrik Security Cloud";
  await db.from("provider_connections").upsert({ id: connectionId, tenant_id: input.tenantId, provider: "rubrik", external_id: uri.origin, display_name: displayName, environment: input.environment ?? "Production", status: "connected", encrypted_credentials: encryptCredentials({ clientId: input.clientId.trim(), clientSecret: input.clientSecret, accessTokenUri: uri.toString(), accessToken: tokens.accessToken, expiresAt: tokens.expiresAt }), credential_expires_at: tokens.expiresAt ?? null, last_error: null, connected_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_by: input.userId }, { onConflict: "id" });
  return { connectionId, displayName };
}

export async function ensureRubrikAccessToken(connectionId: string, tenantId: string) {
  const db = await getAdminClient(); const credentials = await import("./oauth-framework.server").then(({ readConnectionCredentials }) => readConnectionCredentials<RubrikCredentials>(db, connectionId, tenantId));
  if (credentials.accessToken && credentials.expiresAt && new Date(credentials.expiresAt).getTime() - Date.now() > 120_000) return credentials.accessToken;
  try { const tokens = await tokenRequest(credentials); await storeOAuthConnection(db, { connectionId, tenantId, provider: "rubrik", externalId: new URL(credentials.accessTokenUri).origin, displayName: "Rubrik Security Cloud", credentials: { ...credentials, ...tokens }, expiresAt: tokens.expiresAt }); return tokens.accessToken; }
  catch (error) { await markReconnectRequired(db, connectionId, "Rubrik service-account authentication failed. Reconnect required."); throw error; }
}

export const startRubrikConnection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId?: string; clientId: string; clientSecret: string; accessTokenUri: string; displayName?: string; environment?: string }) => input).handler(async ({ data, context }) => { const { tenantId, roles } = await resolveTenant(context.supabase, context.userId); if (!roles.includes("admin") && !roles.includes("manager")) throw new Error("Admin/manager access is required to connect an integration."); return connectRubrik({ tenantId, userId: context.userId, ...data }); });
