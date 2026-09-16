import crypto from "node:crypto";
import { createOAuthState, consumeOAuthState, getAdminClient, readConnectionCredentials, storeOAuthConnection, markReconnectRequired } from "./oauth-framework.server";
import { encryptCredentials } from "./credential-vault.server";

/**
 * SAP supports multiple OAuth-protected products and APIs. The connection therefore
 * requires the tenant's documented authorization/token endpoints instead of guessing
 * a product-specific SAP endpoint.
 */
function httpsUrl(value: string, label: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "https:") throw new Error(`${label} must use HTTPS.`);
  return url.toString();
}

export function buildSapAuthorizeUrl(input: {
  authorizationUrl: string;
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
}): string {
  const url = new URL(httpsUrl(input.authorizationUrl, "SAP authorization URL"));
  url.searchParams.set("client_id", input.clientId.trim());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  if (input.scope?.trim()) url.searchParams.set("scope", input.scope.trim());
  return url.toString();
}

async function tokenRequest(tokenUrl: string, body: URLSearchParams, clientId: string, clientSecret: string) {
  const response = await fetch(httpsUrl(tokenUrl, "SAP token URL"), {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`SAP OAuth token request failed (${response.status}): ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as any;
  if (!json.access_token) throw new Error("SAP OAuth did not return an access token.");
  return json;
}

async function exchangeAuthorizationCode(input: { code: string; clientId: string; clientSecret: string; redirectUri: string; tokenUrl: string }) {
  const body = await tokenRequest(input.tokenUrl, new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
  }), input.clientId, input.clientSecret);
  return {
    accessToken: body.access_token as string,
    refreshToken: body.refresh_token ?? null,
    expiresAt: new Date(Date.now() + Number(body.expires_in ?? 3600) * 1000).toISOString(),
    scopes: typeof body.scope === "string" ? body.scope.split(/\s+/).filter(Boolean) : [],
  };
}

export async function refreshSapAccessToken(input: { clientId: string; clientSecret: string; refreshToken: string; tokenUrl: string }) {
  const body = await tokenRequest(input.tokenUrl, new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
  }), input.clientId, input.clientSecret);
  return {
    accessToken: body.access_token as string,
    refreshToken: body.refresh_token ?? input.refreshToken,
    expiresAt: new Date(Date.now() + Number(body.expires_in ?? 3600) * 1000).toISOString(),
    scopes: typeof body.scope === "string" ? body.scope.split(/\s+/).filter(Boolean) : [],
  };
}

export async function startSapOAuth(input: {
  tenantId: string;
  connectionId?: string;
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  apiBaseUrl?: string;
  scope?: string;
  redirectUri: string;
  displayName?: string;
  environment?: string;
}) {
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret;
  if (!clientId || !clientSecret) throw new Error("SAP OAuth client ID and client secret are required.");
  const authorizationUrl = httpsUrl(input.authorizationUrl, "SAP authorization URL");
  const tokenUrl = httpsUrl(input.tokenUrl, "SAP token URL");
  const apiBaseUrl = input.apiBaseUrl?.trim() ? httpsUrl(input.apiBaseUrl, "SAP API base URL") : undefined;
  const db = await getAdminClient();
  const connectionId = input.connectionId ?? crypto.randomUUID();
  await db.from("provider_connections").upsert({
    id: connectionId,
    tenant_id: input.tenantId,
    provider: "sap",
    display_name: input.displayName ?? null,
    environment: input.environment ?? "Production",
    status: "failed",
    encrypted_credentials: encryptCredentials({ provider: "sap", clientId, clientSecret, authorizationUrl, tokenUrl, apiBaseUrl, scope: input.scope?.trim() || undefined }),
    last_error: "OAuth authorization in progress",
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  const state = await createOAuthState(db, { tenantId: input.tenantId, provider: "sap", redirectUri: input.redirectUri, connectionId });
  return { connectionId, authorizeUrl: buildSapAuthorizeUrl({ authorizationUrl, clientId, redirectUri: input.redirectUri, state, scope: input.scope }) };
}

export async function completeSapOAuth(state: string, code: string) {
  const db = await getAdminClient();
  const stateRecord = await consumeOAuthState(db, state, "sap");
  const credentials = await readConnectionCredentials<{ clientId: string; clientSecret: string; authorizationUrl: string; tokenUrl: string; apiBaseUrl?: string; scope?: string }>(db, stateRecord.connectionId, stateRecord.tenantId);
  const tokens = await exchangeAuthorizationCode({ code, clientId: credentials.clientId, clientSecret: credentials.clientSecret, redirectUri: stateRecord.redirectUri, tokenUrl: credentials.tokenUrl });
  await storeOAuthConnection(db, {
    connectionId: stateRecord.connectionId,
    tenantId: stateRecord.tenantId,
    provider: "sap",
    externalId: credentials.apiBaseUrl ?? credentials.tokenUrl,
    displayName: "SAP",
    credentials: { ...credentials, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt, scopes: tokens.scopes },
    expiresAt: tokens.expiresAt,
  });
  return { connectionId: stateRecord.connectionId, tenantId: stateRecord.tenantId };
}

export async function ensureSapAccessToken(connectionId: string, tenantId: string) {
  const db = await getAdminClient();
  const credentials = await readConnectionCredentials<any>(db, connectionId, tenantId);
  if (credentials.accessToken && credentials.expiresAt && new Date(credentials.expiresAt).getTime() - Date.now() > 120_000) return credentials.accessToken;
  if (!credentials.refreshToken) {
    await markReconnectRequired(db, connectionId, "SAP access expired and no refresh token is available. Reconnect required.");
    throw new Error("SAP reconnect required.");
  }
  try {
    const refreshed = await refreshSapAccessToken({ clientId: credentials.clientId, clientSecret: credentials.clientSecret, refreshToken: credentials.refreshToken, tokenUrl: credentials.tokenUrl });
    await storeOAuthConnection(db, {
      connectionId,
      tenantId,
      provider: "sap",
      externalId: credentials.apiBaseUrl ?? credentials.tokenUrl,
      displayName: "SAP",
      credentials: { ...credentials, accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken, expiresAt: refreshed.expiresAt, scopes: refreshed.scopes },
      expiresAt: refreshed.expiresAt,
    });
    return refreshed.accessToken;
  } catch (error) {
    await markReconnectRequired(db, connectionId, "SAP token refresh failed. Reconnect required.");
    throw error;
  }
}
