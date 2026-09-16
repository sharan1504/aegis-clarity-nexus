import crypto from "node:crypto";
import { createOAuthState, consumeOAuthState, getAdminClient, markReconnectRequired, readConnectionCredentials, storeOAuthConnection, assertFreshExpiry } from "./oauth-framework.server";

export const GITLAB_SCOPES = ["read_api", "read_user", "openid", "profile"] as const;

type GitLabCredentials = { instanceUrl: string; clientId: string; clientSecret: string; accessToken?: string; refreshToken?: string; expiresAt?: string; userId?: string; username?: string; scopes?: string[]; displayName?: string };

function normalizeInstanceUrl(value: string) {
  const raw = value.trim() || "https://gitlab.com";
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("GitLab instance URL must use HTTPS.");
  return url.origin;
}

function form(data: Record<string, string>) { return new URLSearchParams(data); }

async function tokenRequest(instanceUrl: string, body: URLSearchParams) {
  const response = await fetch(`${instanceUrl}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body });
  const text = await response.text();
  if (!response.ok) throw new Error(`GitLab OAuth token request failed (${response.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text) as { access_token: string; refresh_token?: string; expires_in?: number; token_type?: string; scope?: string };
}

async function getUser(instanceUrl: string, accessToken: string) {
  const response = await fetch(`${instanceUrl}/api/v4/user`, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } });
  const text = await response.text();
  if (!response.ok) throw new Error(`GitLab identity validation failed (${response.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text) as { id?: number; username?: string; name?: string; web_url?: string };
}

export function buildGitLabAuthorizeUrl(input: { instanceUrl: string; clientId: string; redirectUri: string; state: string }) {
  const url = new URL(`${normalizeInstanceUrl(input.instanceUrl)}/oauth/authorize`);
  url.searchParams.set("client_id", input.clientId.trim());
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", GITLAB_SCOPES.join(" "));
  return url.toString();
}

async function exchangeCode(input: { instanceUrl: string; code: string; clientId: string; clientSecret: string; redirectUri: string }) {
  return tokenRequest(input.instanceUrl, form({ grant_type: "authorization_code", code: input.code, redirect_uri: input.redirectUri, client_id: input.clientId, client_secret: input.clientSecret }));
}

export async function startGitLabOAuth(input: { tenantId: string; connectionId?: string; instanceUrl: string; clientId: string; clientSecret: string; redirectUri: string; displayName?: string; environment?: string }) {
  const db = await getAdminClient();
  const instanceUrl = normalizeInstanceUrl(input.instanceUrl);
  const connectionId = input.connectionId ?? crypto.randomUUID();
  await storeOAuthConnection(db, { connectionId, tenantId: input.tenantId, provider: "gitlab", displayName: input.displayName ?? "GitLab", environment: input.environment ?? "Production", status: "failed", credentials: { provider: "gitlab", instanceUrl, clientId: input.clientId.trim(), clientSecret: input.clientSecret.trim(), displayName: input.displayName }, expiresAt: null });
  await db.from("provider_connections").update({ last_error: "OAuth authorization in progress", connected_at: null, updated_at: new Date().toISOString() }).eq("id", connectionId).eq("tenant_id", input.tenantId);
  const state = await createOAuthState(db, { tenantId: input.tenantId, provider: "gitlab", redirectUri: input.redirectUri, connectionId });
  return { connectionId, authorizeUrl: buildGitLabAuthorizeUrl({ instanceUrl, clientId: input.clientId, redirectUri: input.redirectUri, state }) };
}

export async function completeGitLabOAuth(state: string, code: string) {
  const db = await getAdminClient();
  const stateRecord = await consumeOAuthState(db, state, "gitlab");
  const credentials = await readConnectionCredentials<GitLabCredentials>(db, stateRecord.connectionId, stateRecord.tenantId);
  const tokens = await exchangeCode({ instanceUrl: credentials.instanceUrl, code, clientId: credentials.clientId, clientSecret: credentials.clientSecret, redirectUri: stateRecord.redirectUri });
  const user = await getUser(credentials.instanceUrl, tokens.access_token);
  if (!user.id) throw new Error("GitLab OAuth completed but no GitLab user identity was returned.");
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in ?? 7200) * 1000).toISOString();
  const scopes = tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : [...GITLAB_SCOPES];
  const displayName = credentials.displayName ?? user.name ?? user.username ?? `GitLab ${user.id}`;
  await storeOAuthConnection(db, { connectionId: stateRecord.connectionId, tenantId: stateRecord.tenantId, provider: "gitlab", externalId: String(user.id), displayName, credentials: { ...credentials, accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? null, expiresAt, userId: String(user.id), username: user.username, scopes }, expiresAt });
  return { connectionId: stateRecord.connectionId, displayName, externalId: String(user.id), instanceUrl: credentials.instanceUrl };
}

export async function ensureGitLabAccessToken(connectionId: string, tenantId: string) {
  const db = await getAdminClient();
  const credentials = await readConnectionCredentials<GitLabCredentials>(db, connectionId, tenantId);
  if (credentials.accessToken && assertFreshExpiry(credentials.expiresAt)) return credentials.accessToken;
  if (!credentials.refreshToken) { await markReconnectRequired(db, connectionId, "GitLab access expired and no refresh token is available. Reconnect required."); throw new Error("GitLab reconnect required."); }
  const tokens = await tokenRequest(credentials.instanceUrl, form({ grant_type: "refresh_token", refresh_token: credentials.refreshToken, client_id: credentials.clientId, client_secret: credentials.clientSecret }));
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in ?? 7200) * 1000).toISOString();
  await storeOAuthConnection(db, { connectionId, tenantId, provider: "gitlab", externalId: credentials.userId ?? null, displayName: credentials.displayName ?? credentials.username ?? "GitLab", credentials: { ...credentials, accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? credentials.refreshToken, expiresAt, scopes: tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : credentials.scopes }, expiresAt });
  return tokens.access_token;
}
