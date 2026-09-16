import crypto from "node:crypto";
import { createOAuthState, consumeOAuthState, getAdminClient, readConnectionCredentials, storeOAuthConnection, markReconnectRequired } from "./oauth-framework.server";
import { encryptCredentials } from "./credential-vault.server";

function baseUrl(value: string) { const url = new URL(value.trim()); if (url.protocol !== "https:") throw new Error("CrowdStrike API URL must use HTTPS."); return url.toString().replace(/\/$/, ""); }

async function tokenRequest(input: { apiBaseUrl: string; clientId: string; clientSecret: string }) {
  const response = await fetch(`${baseUrl(input.apiBaseUrl)}/oauth2/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams({ client_id: input.clientId, client_secret: input.clientSecret }) });
  const text = await response.text(); if (!response.ok) throw new Error(`CrowdStrike OAuth failed (${response.status}): ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as any; if (!json.access_token) throw new Error("CrowdStrike did not return an access token."); return json;
}

export async function startCrowdStrikeOAuth(input: { tenantId: string; connectionId?: string; clientId: string; clientSecret: string; apiBaseUrl: string; displayName?: string; environment?: string }) {
  const db = await getAdminClient(); const connectionId = input.connectionId ?? crypto.randomUUID(); const apiBase = baseUrl(input.apiBaseUrl);
  const token = await tokenRequest({ apiBaseUrl: apiBase, clientId: input.clientId.trim(), clientSecret: input.clientSecret });
  const expiresAt = new Date(Date.now() + Number(token.expires_in ?? 1800) * 1000).toISOString();
  await db.from("provider_connections").upsert({ id: connectionId, tenant_id: input.tenantId, provider: "crowdstrike", external_id: apiBase, display_name: input.displayName ?? "CrowdStrike", environment: input.environment ?? "Production", status: "connected", encrypted_credentials: encryptCredentials({ clientId: input.clientId.trim(), clientSecret: input.clientSecret, apiBaseUrl: apiBase, accessToken: token.access_token }), credential_expires_at: expiresAt, last_error: null, connected_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "id" });
  return { connectionId, displayName: input.displayName ?? "CrowdStrike" };
}

export async function ensureCrowdStrikeAccessToken(connectionId: string, tenantId: string) {
  const db = await getAdminClient(); const credentials = await readConnectionCredentials<any>(db, connectionId, tenantId);
  if (credentials.accessToken && credentials.expiresAt && new Date(credentials.expiresAt).getTime() - Date.now() > 120_000) return credentials.accessToken;
  try { const token = await tokenRequest(credentials); const expiresAt = new Date(Date.now() + Number(token.expires_in ?? 1800) * 1000).toISOString(); await storeOAuthConnection(db, { connectionId, tenantId, provider: "crowdstrike", externalId: credentials.apiBaseUrl, displayName: credentials.displayName ?? "CrowdStrike", credentials: { ...credentials, accessToken: token.access_token, expiresAt }, expiresAt }); return token.access_token; } catch (error) { await markReconnectRequired(db, connectionId, "CrowdStrike token renewal failed. Reconnect required."); throw error; }
}
