import crypto from "node:crypto";
import { createOAuthState, consumeOAuthState, getAdminClient, readConnectionCredentials, storeOAuthConnection, markReconnectRequired } from "./oauth-framework.server";
import { encryptCredentials } from "./credential-vault.server";

export const CONFLUENCE_SCOPES = [
  "read:confluence-content.all",
  "read:confluence-space.summary",
  "read:confluence-user",
  "offline_access",
] as const;

const AUTHORIZE_URL = "https://auth.atlassian.com/authorize";
const TOKEN_URL = "https://auth.atlassian.com/oauth/token";
const RESOURCES_URL = "https://api.atlassian.com/oauth/token/accessible-resources";

export function buildConfluenceAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("audience", "api.atlassian.com");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("scope", CONFLUENCE_SCOPES.join(" "));
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

async function tokenRequest(body: URLSearchParams) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Confluence OAuth token request failed (${response.status}): ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as any;
  if (!json.access_token) throw new Error("Confluence OAuth did not return an access token.");
  return json;
}

async function exchangeAuthorizationCode(input: { code: string; clientId: string; clientSecret: string; redirectUri: string }) {
  const body = await tokenRequest(new URLSearchParams({
    grant_type: "authorization_code",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
  }));
  return {
    accessToken: body.access_token as string,
    refreshToken: body.refresh_token ?? null,
    expiresAt: new Date(Date.now() + Number(body.expires_in ?? 3600) * 1000).toISOString(),
    scopes: body.scope?.split(/\s+/).filter(Boolean) ?? [...CONFLUENCE_SCOPES],
  };
}

export async function refreshConfluenceAccessToken(input: { clientId: string; clientSecret: string; refreshToken: string }) {
  const body = await tokenRequest(new URLSearchParams({
    grant_type: "refresh_token",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
  }));
  return {
    accessToken: body.access_token as string,
    refreshToken: body.refresh_token ?? input.refreshToken,
    expiresAt: new Date(Date.now() + Number(body.expires_in ?? 3600) * 1000).toISOString(),
    scopes: body.scope?.split(/\s+/).filter(Boolean) ?? [...CONFLUENCE_SCOPES],
  };
}

async function resolveAccessibleSite(accessToken: string) {
  const response = await fetch(RESOURCES_URL, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Confluence accessible-resources failed (${response.status}): ${text.slice(0, 300)}`);
  const sites = JSON.parse(text) as Array<{ id?: string; name?: string; url?: string; scopes?: string[] }>;
  const site = sites.find((item) => item.id && item.scopes?.some((scope) => scope.includes("confluence"))) ?? sites.find((item) => item.id);
  if (!site?.id) throw new Error("Atlassian returned no accessible Confluence site for this connection.");
  return site;
}

export async function startConfluenceOAuth(input: { tenantId: string; userId: string; connectionId?: string; clientId: string; clientSecret: string; redirectUri: string; displayName?: string; environment?: string }) {
  const db = await getAdminClient();
  const connectionId = input.connectionId ?? crypto.randomUUID();
  await db.from("provider_connections").upsert({
    id: connectionId,
    tenant_id: input.tenantId,
    provider: "confluence",
    display_name: input.displayName ?? null,
    environment: input.environment ?? "Production",
    status: "failed",
    encrypted_credentials: encryptCredentials({ clientId: input.clientId.trim(), clientSecret: input.clientSecret, provider: "confluence" }),
    last_error: "OAuth authorization in progress",
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  const state = await createOAuthState(db, { tenantId: input.tenantId, provider: "confluence", redirectUri: input.redirectUri, connectionId });
  return { connectionId, authorizeUrl: buildConfluenceAuthorizeUrl({ clientId: input.clientId, redirectUri: input.redirectUri, state }) };
}

export async function completeConfluenceOAuth(state: string, code: string) {
  const db = await getAdminClient();
  const stateRecord = await consumeOAuthState(db, state, "confluence");
  const credentials = await readConnectionCredentials<{ clientId: string; clientSecret: string }>(db, stateRecord.connectionId, stateRecord.tenantId);
  const tokens = await exchangeAuthorizationCode({ code, clientId: credentials.clientId, clientSecret: credentials.clientSecret, redirectUri: stateRecord.redirectUri });
  const site = await resolveAccessibleSite(tokens.accessToken);
  await storeOAuthConnection(db, {
    connectionId: stateRecord.connectionId,
    tenantId: stateRecord.tenantId,
    provider: "confluence",
    externalId: site.id,
    displayName: site.name ?? "Confluence",
    credentials: { ...credentials, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, cloudId: site.id, siteUrl: site.url, scopes: tokens.scopes },
    expiresAt: tokens.expiresAt,
  });
  return { connectionId: stateRecord.connectionId, tenantId: stateRecord.tenantId, cloudId: site.id, displayName: site.name ?? "Confluence" };
}

export async function ensureConfluenceAccessToken(connectionId: string, tenantId: string) {
  const db = await getAdminClient();
  const credentials = await readConnectionCredentials<any>(db, connectionId, tenantId);
  if (credentials.accessToken && credentials.expiresAt && new Date(credentials.expiresAt).getTime() - Date.now() > 120_000) return credentials.accessToken;
  if (!credentials.refreshToken) {
    await markReconnectRequired(db, connectionId, "Confluence access expired and no refresh token is available. Reconnect required.");
    throw new Error("Confluence reconnect required.");
  }
  try {
    const refreshed = await refreshConfluenceAccessToken({ clientId: credentials.clientId, clientSecret: credentials.clientSecret, refreshToken: credentials.refreshToken });
    await storeOAuthConnection(db, {
      connectionId,
      tenantId,
      provider: "confluence",
      externalId: credentials.cloudId,
      displayName: credentials.displayName ?? "Confluence",
      credentials: { ...credentials, accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken, expiresAt: refreshed.expiresAt, scopes: refreshed.scopes },
      expiresAt: refreshed.expiresAt,
    });
    return refreshed.accessToken;
  } catch (error) {
    await markReconnectRequired(db, connectionId, "Confluence token refresh failed. Reconnect required.");
    throw error;
  }
}
