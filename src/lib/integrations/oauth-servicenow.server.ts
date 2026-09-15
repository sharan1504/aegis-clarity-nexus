import crypto from "node:crypto";
import { createOAuthState, consumeOAuthState, createPkcePair, getAdminClient, readConnectionCredentials, storeOAuthConnection, markReconnectRequired } from "./oauth-framework.server";

// Confirmed endpoint shape: https://{instance}.service-now.com/oauth_auth.do and /oauth_token.do.
// The official ServiceNow tutorial documents the useraccount scope; the exact
// scope required by a customer's custom instance is configuration-dependent.
export const SERVICENOW_DEFAULT_SCOPE = "useraccount";

function instanceBase(value: string): string {
  const raw = value.trim().replace(/\/$/, "");
  const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  if (!/\.service-now\.com$/i.test(url.hostname)) throw new Error("ServiceNow instance URL must use the *.service-now.com hostname.");
  return url.toString().replace(/\/$/, "");
}

export function buildServiceNowAuthorizeUrl(input: { instanceUrl: string; clientId: string; redirectUri: string; state: string; scope?: string; codeChallenge?: string }): string {
  const url = new URL(`${instanceBase(input.instanceUrl)}/oauth_auth.do`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", input.scope ?? SERVICENOW_DEFAULT_SCOPE);
  if (input.codeChallenge) { url.searchParams.set("code_challenge", input.codeChallenge); url.searchParams.set("code_challenge_method", "S256"); }
  return url.toString();
}

async function exchangeAuthorizationCode(input: { instanceUrl: string; code: string; clientId: string; clientSecret: string; redirectUri: string; codeVerifier?: string }) {
  const params = new URLSearchParams({ grant_type: "authorization_code", code: input.code, client_id: input.clientId, client_secret: input.clientSecret, redirect_uri: input.redirectUri });
  if (input.codeVerifier) params.set("code_verifier", input.codeVerifier);
  const response = await fetch(`${instanceBase(input.instanceUrl)}/oauth_token.do`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: params });
  const text = await response.text();
  if (!response.ok) throw new Error(`ServiceNow OAuth token exchange failed (${response.status}): ${text.slice(0, 300)}`);
  const body = JSON.parse(text) as { access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string; scope?: string };
  if (!body.access_token) throw new Error("ServiceNow OAuth did not return an access token.");
  return { accessToken: body.access_token, refreshToken: body.refresh_token ?? null, expiresAt: new Date(Date.now() + Number(body.expires_in ?? 1800) * 1000).toISOString(), tokenType: body.token_type ?? "Bearer", scopes: body.scope?.split(/\s+/).filter(Boolean) ?? [SERVICENOW_DEFAULT_SCOPE] };
}

export async function refreshServiceNowAccessToken(input: { instanceUrl: string; clientId: string; clientSecret: string; refreshToken: string }) {
  const params = new URLSearchParams({ grant_type: "refresh_token", refresh_token: input.refreshToken, client_id: input.clientId, client_secret: input.clientSecret });
  const response = await fetch(`${instanceBase(input.instanceUrl)}/oauth_token.do`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: params });
  const text = await response.text();
  if (!response.ok) throw new Error(`ServiceNow refresh failed (${response.status}): ${text.slice(0, 300)}`);
  const body = JSON.parse(text) as { access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string; scope?: string };
  if (!body.access_token) throw new Error("ServiceNow refresh did not return an access token.");
  return { accessToken: body.access_token, refreshToken: body.refresh_token ?? input.refreshToken, expiresAt: new Date(Date.now() + Number(body.expires_in ?? 1800) * 1000).toISOString(), tokenType: body.token_type ?? "Bearer", scopes: body.scope?.split(/\s+/).filter(Boolean) ?? [SERVICENOW_DEFAULT_SCOPE] };
}

export async function startServiceNowOAuth(input: { tenantId: string; connectionId?: string; instanceUrl: string; clientId: string; clientSecret: string; redirectUri: string; displayName?: string; environment?: string; scope?: string }) {
  const db = await getAdminClient();
  const connectionId = input.connectionId ?? crypto.randomUUID();
  const { verifier, challenge } = createPkcePair();
  const { encryptCredentials } = await import("./credential-vault.server");
  const instanceUrl = instanceBase(input.instanceUrl);
  await db.from("provider_connections").upsert({ id: connectionId, tenant_id: input.tenantId, provider: "servicenow", display_name: input.displayName ?? null, environment: input.environment ?? "Production", status: "failed", encrypted_credentials: encryptCredentials({ instanceUrl, clientId: input.clientId.trim(), clientSecret: input.clientSecret, scope: input.scope ?? SERVICENOW_DEFAULT_SCOPE }), last_error: "OAuth authorization in progress", updated_at: new Date().toISOString() }, { onConflict: "id" });
  const state = await createOAuthState(db, { tenantId: input.tenantId, provider: "servicenow", redirectUri: input.redirectUri, connectionId, codeVerifier: verifier });
  return { connectionId, authorizeUrl: buildServiceNowAuthorizeUrl({ instanceUrl, clientId: input.clientId, redirectUri: input.redirectUri, state, scope: input.scope, codeChallenge: challenge }) };
}

export async function completeServiceNowOAuth(state: string, code: string) {
  const db = await getAdminClient();
  const stateRecord = await consumeOAuthState(db, state, "servicenow");
  const credentials = await readConnectionCredentials<{ instanceUrl: string; clientId: string; clientSecret: string; scope?: string }>(db, stateRecord.connectionId, stateRecord.tenantId);
  const tokens = await exchangeAuthorizationCode({ instanceUrl: credentials.instanceUrl, code, clientId: credentials.clientId, clientSecret: credentials.clientSecret, redirectUri: stateRecord.redirectUri, codeVerifier: stateRecord.codeVerifier });
  await storeOAuthConnection(db, { connectionId: stateRecord.connectionId, tenantId: stateRecord.tenantId, provider: "servicenow", externalId: credentials.instanceUrl, displayName: "ServiceNow", credentials: { ...credentials, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, tokenType: tokens.tokenType, scopes: tokens.scopes }, expiresAt: tokens.expiresAt });
  return { connectionId: stateRecord.connectionId, tenantId: stateRecord.tenantId, instanceUrl: credentials.instanceUrl };
}

export async function ensureServiceNowAccessToken(connectionId: string, tenantId: string) {
  const db = await getAdminClient();
  const credentials = await readConnectionCredentials<any>(db, connectionId, tenantId);
  if (credentials.expiresAt && new Date(credentials.expiresAt).getTime() - Date.now() > 120_000 && credentials.accessToken) return credentials.accessToken;
  if (!credentials.refreshToken) { await markReconnectRequired(db, connectionId, "ServiceNow access expired and no refresh token is available. Reconnect required."); throw new Error("ServiceNow reconnect required."); }
  try {
    const refreshed = await refreshServiceNowAccessToken({ instanceUrl: credentials.instanceUrl, clientId: credentials.clientId, clientSecret: credentials.clientSecret, refreshToken: credentials.refreshToken });
    await storeOAuthConnection(db, { connectionId, tenantId, provider: "servicenow", externalId: credentials.instanceUrl, displayName: "ServiceNow", credentials: { ...credentials, accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken, tokenType: refreshed.tokenType, scopes: refreshed.scopes, expiresAt: refreshed.expiresAt }, expiresAt: refreshed.expiresAt });
    return refreshed.accessToken;
  } catch (error) {
    await markReconnectRequired(db, connectionId, "ServiceNow token refresh failed. Reconnect required.");
    throw error;
  }
}
