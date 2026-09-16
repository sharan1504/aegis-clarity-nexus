import crypto from "node:crypto";
import { createOAuthState, consumeOAuthState, getAdminClient, readConnectionCredentials, storeOAuthConnection, markReconnectRequired } from "./oauth-framework.server";
import { encryptCredentials } from "./credential-vault.server";

export const SNOWFLAKE_SCOPES = ["session:role:PUBLIC"] as const;

function accountUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:") throw new Error("Snowflake account URL must use HTTPS.");
  return url.toString().replace(/\/$/, "");
}

export function buildSnowflakeAuthorizeUrl(input: { accountUrl: string; clientId: string; redirectUri: string; state: string; scope?: string }) {
  const base = accountUrl(input.accountUrl);
  const url = new URL(`${base}/oauth/authorize`);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", input.scope ?? SNOWFLAKE_SCOPES[0]);
  return url.toString();
}

async function tokenRequest(input: { accountUrl: string; clientId: string; clientSecret: string; body: URLSearchParams }) {
  const response = await fetch(`${accountUrl(input.accountUrl)}/oauth/token-request`, { method: "POST", headers: { authorization: `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: input.body });
  const text = await response.text();
  if (!response.ok) throw new Error(`Snowflake OAuth token request failed (${response.status}): ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as any;
  if (!json.access_token) throw new Error("Snowflake did not return an access token.");
  return json;
}

export async function startSnowflakeOAuth(input: { tenantId: string; connectionId?: string; clientId: string; clientSecret: string; accountUrl: string; redirectUri: string; displayName?: string; environment?: string }) {
  const db = await getAdminClient();
  const connectionId = input.connectionId ?? crypto.randomUUID();
  const normalized = accountUrl(input.accountUrl);
  await db.from("provider_connections").upsert({ id: connectionId, tenant_id: input.tenantId, provider: "snowflake", display_name: input.displayName ?? "Snowflake", environment: input.environment ?? "Production", status: "failed", encrypted_credentials: encryptCredentials({ clientId: input.clientId.trim(), clientSecret: input.clientSecret, accountUrl: normalized }), last_error: "OAuth authorization in progress", updated_at: new Date().toISOString() }, { onConflict: "id" });
  const state = await createOAuthState(db, { tenantId: input.tenantId, provider: "snowflake", redirectUri: input.redirectUri, connectionId });
  return { connectionId, authorizeUrl: buildSnowflakeAuthorizeUrl({ accountUrl: normalized, clientId: input.clientId, redirectUri: input.redirectUri, state }) };
}

export async function completeSnowflakeOAuth(state: string, code: string) {
  const db = await getAdminClient();
  const stateRecord = await consumeOAuthState(db, state, "snowflake");
  const credentials = await readConnectionCredentials<{ clientId: string; clientSecret: string; accountUrl: string }>(db, stateRecord.connectionId, stateRecord.tenantId);
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: stateRecord.redirectUri });
  const token = await tokenRequest({ ...credentials, body });
  const expiresAt = new Date(Date.now() + Number(token.expires_in ?? 600) * 1000).toISOString();
  await storeOAuthConnection(db, { connectionId: stateRecord.connectionId, tenantId: stateRecord.tenantId, provider: "snowflake", externalId: new URL(credentials.accountUrl).hostname, displayName: "Snowflake", credentials: { ...credentials, accessToken: token.access_token, refreshToken: token.refresh_token, scopes: token.scope?.split(/\s+/).filter(Boolean) ?? [...SNOWFLAKE_SCOPES] }, expiresAt });
  return { connectionId: stateRecord.connectionId, displayName: "Snowflake" };
}

export async function ensureSnowflakeAccessToken(connectionId: string, tenantId: string) {
  const db = await getAdminClient();
  const credentials = await readConnectionCredentials<any>(db, connectionId, tenantId);
  if (credentials.accessToken && credentials.expiresAt && new Date(credentials.expiresAt).getTime() - Date.now() > 60_000) return credentials.accessToken;
  if (!credentials.refreshToken) { await markReconnectRequired(db, connectionId, "Snowflake access expired and no refresh token is available."); throw new Error("Snowflake reconnect required."); }
  try {
    const token = await tokenRequest({ ...credentials, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: credentials.refreshToken }) });
    const expiresAt = new Date(Date.now() + Number(token.expires_in ?? 600) * 1000).toISOString();
    await storeOAuthConnection(db, { connectionId, tenantId, provider: "snowflake", externalId: new URL(credentials.accountUrl).hostname, displayName: "Snowflake", credentials: { ...credentials, accessToken: token.access_token, refreshToken: token.refresh_token ?? credentials.refreshToken }, expiresAt });
    return token.access_token;
  } catch (error) { await markReconnectRequired(db, connectionId, "Snowflake token refresh failed. Reconnect required."); throw error; }
}
