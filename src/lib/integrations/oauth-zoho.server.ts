import crypto from "node:crypto";
import { createOAuthState, consumeOAuthState, getAdminClient, markReconnectRequired, readConnectionCredentials, storeOAuthConnection, assertFreshExpiry } from "./oauth-framework.server";

export const ZOHO_CRM_SCOPES = ["ZohoCRM.modules.READ", "ZohoCRM.settings.READ", "ZohoCRM.users.READ"] as const;

type ZohoCredentials = { accountsUrl: string; apiDomain?: string; clientId: string; clientSecret: string; accessToken?: string; refreshToken?: string; expiresAt?: string; scopes?: string[]; displayName?: string; location?: string };

function normalizeAccountsUrl(value: string) {
  const raw = value.trim() || "https://accounts.zoho.com";
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("Zoho Accounts URL must use HTTPS.");
  return url.origin;
}

function form(data: Record<string, string>) { return new URLSearchParams(data); }

async function tokenRequest(accountsUrl: string, body: URLSearchParams) {
  const response = await fetch(`${accountsUrl}/oauth/v2/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body });
  const text = await response.text();
  if (!response.ok) throw new Error(`Zoho OAuth token request failed (${response.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text) as { access_token: string; refresh_token?: string; expires_in?: number; api_domain?: string; token_type?: string };
}

async function validateAccess(apiDomain: string, accessToken: string) {
  const response = await fetch(`${apiDomain}/crm/v8/users?type=CurrentUser`, { headers: { authorization: `Zoho-oauthtoken ${accessToken}`, accept: "application/json" } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Zoho CRM access validation failed (${response.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text) as { users?: Array<{ id?: string; full_name?: string; email?: string }> };
}

export function buildZohoAuthorizeUrl(input: { accountsUrl: string; clientId: string; redirectUri: string; state: string }) {
  const url = new URL(`${normalizeAccountsUrl(input.accountsUrl)}/oauth/v2/auth`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId.trim());
  url.searchParams.set("scope", ZOHO_CRM_SCOPES.join(","));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  return url.toString();
}

async function exchangeCode(input: { accountsUrl: string; code: string; clientId: string; clientSecret: string; redirectUri: string }) {
  return tokenRequest(input.accountsUrl, form({ code: input.code, client_id: input.clientId, client_secret: input.clientSecret, redirect_uri: input.redirectUri, grant_type: "authorization_code" }));
}

export async function startZohoOAuth(input: { tenantId: string; connectionId?: string; accountsUrl: string; clientId: string; clientSecret: string; redirectUri: string; displayName?: string; environment?: string }) {
  const db = await getAdminClient();
  const accountsUrl = normalizeAccountsUrl(input.accountsUrl);
  const connectionId = input.connectionId ?? crypto.randomUUID();
  await storeOAuthConnection(db, { connectionId, tenantId: input.tenantId, provider: "zoho", displayName: input.displayName ?? "Zoho CRM", environment: input.environment ?? "Production", status: "failed", credentials: { provider: "zoho", accountsUrl, clientId: input.clientId.trim(), clientSecret: input.clientSecret.trim(), displayName: input.displayName }, expiresAt: null });
  await db.from("provider_connections").update({ last_error: "OAuth authorization in progress", connected_at: null, updated_at: new Date().toISOString() }).eq("id", connectionId).eq("tenant_id", input.tenantId);
  const state = await createOAuthState(db, { tenantId: input.tenantId, provider: "zoho", redirectUri: input.redirectUri, connectionId });
  return { connectionId, authorizeUrl: buildZohoAuthorizeUrl({ accountsUrl, clientId: input.clientId, redirectUri: input.redirectUri, state }) };
}

export async function completeZohoOAuth(state: string, code: string) {
  const db = await getAdminClient();
  const stateRecord = await consumeOAuthState(db, state, "zoho");
  const credentials = await readConnectionCredentials<ZohoCredentials>(db, stateRecord.connectionId, stateRecord.tenantId);
  const tokens = await exchangeCode({ accountsUrl: credentials.accountsUrl, code, clientId: credentials.clientId, clientSecret: credentials.clientSecret, redirectUri: stateRecord.redirectUri });
  if (!tokens.access_token || !tokens.api_domain) throw new Error("Zoho OAuth completed without the required access token or API domain.");
  const users = await validateAccess(tokens.api_domain, tokens.access_token);
  const currentUser = users.users?.[0];
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString();
  const displayName = credentials.displayName ?? currentUser?.full_name ?? currentUser?.email ?? "Zoho CRM";
  await storeOAuthConnection(db, { connectionId: stateRecord.connectionId, tenantId: stateRecord.tenantId, provider: "zoho", externalId: currentUser?.id ?? credentials.accountsUrl, displayName, credentials: { ...credentials, accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? credentials.refreshToken, expiresAt, apiDomain: tokens.api_domain, scopes: [...ZOHO_CRM_SCOPES] }, expiresAt });
  return { connectionId: stateRecord.connectionId, displayName, externalId: currentUser?.id ?? credentials.accountsUrl, apiDomain: tokens.api_domain };
}

export async function ensureZohoAccessToken(connectionId: string, tenantId: string) {
  const db = await getAdminClient();
  const credentials = await readConnectionCredentials<ZohoCredentials>(db, connectionId, tenantId);
  if (credentials.accessToken && assertFreshExpiry(credentials.expiresAt)) return credentials.accessToken;
  if (!credentials.refreshToken) { await markReconnectRequired(db, connectionId, "Zoho CRM access expired and no refresh token is available. Reconnect required."); throw new Error("Zoho CRM reconnect required."); }
  const tokens = await tokenRequest(credentials.accountsUrl, form({ refresh_token: credentials.refreshToken, client_id: credentials.clientId, client_secret: credentials.clientSecret, grant_type: "refresh_token" }));
  if (!tokens.access_token) throw new Error("Zoho CRM refresh did not return an access token.");
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString();
  await storeOAuthConnection(db, { connectionId, tenantId, provider: "zoho", externalId: credentials.accountsUrl, displayName: credentials.displayName ?? "Zoho CRM", credentials: { ...credentials, accessToken: tokens.access_token, expiresAt, apiDomain: tokens.api_domain ?? credentials.apiDomain }, expiresAt });
  return tokens.access_token;
}
