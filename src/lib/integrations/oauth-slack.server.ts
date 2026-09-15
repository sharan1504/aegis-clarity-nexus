import crypto from "node:crypto";
import { createOAuthState, consumeOAuthState, createPkcePair, getAdminClient, readConnectionCredentials, storeOAuthConnection, markReconnectRequired } from "./oauth-framework.server";

export const SLACK_SCOPES = ["channels:read", "users:read"] as const;
const AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize";
const ACCESS_URL = "https://slack.com/api/oauth.v2.access";

export function buildSlackAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string; codeChallenge: string }): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", SLACK_SCOPES.join(","));
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function oauthAccess(params: URLSearchParams) {
  const response = await fetch(ACCESS_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: params });
  const text = await response.text();
  if (!response.ok) throw new Error(`Slack OAuth request failed (${response.status}): ${text.slice(0, 300)}`);
  const body = JSON.parse(text) as any;
  if (!body.ok) throw new Error(`Slack OAuth request failed: ${String(body.error ?? "unknown_error")}`);
  return body;
}

async function exchangeAuthorizationCode(input: { code: string; clientId: string; clientSecret: string; redirectUri: string; codeVerifier: string }) {
  return oauthAccess(new URLSearchParams({ code: input.code, client_id: input.clientId, client_secret: input.clientSecret, redirect_uri: input.redirectUri, code_verifier: input.codeVerifier }));
}

export async function refreshSlackAccessToken(input: { clientId: string; clientSecret: string; refreshToken: string }) {
  return oauthAccess(new URLSearchParams({ grant_type: "refresh_token", refresh_token: input.refreshToken, client_id: input.clientId, client_secret: input.clientSecret }));
}

export async function startSlackOAuth(input: { tenantId: string; connectionId?: string; clientId: string; clientSecret: string; redirectUri: string; displayName?: string; environment?: string }) {
  const db = await getAdminClient();
  const connectionId = input.connectionId ?? crypto.randomUUID();
  const { verifier, challenge } = createPkcePair();
  const { encryptCredentials } = await import("./credential-vault.server");
  await db.from("provider_connections").upsert({ id: connectionId, tenant_id: input.tenantId, provider: "slack", display_name: input.displayName ?? null, environment: input.environment ?? "Production", status: "failed", encrypted_credentials: encryptCredentials({ clientId: input.clientId.trim(), clientSecret: input.clientSecret, tokenRotation: true }), last_error: "OAuth authorization in progress", updated_at: new Date().toISOString() }, { onConflict: "id" });
  const state = await createOAuthState(db, { tenantId: input.tenantId, provider: "slack", redirectUri: input.redirectUri, connectionId, codeVerifier: verifier });
  return { connectionId, authorizeUrl: buildSlackAuthorizeUrl({ clientId: input.clientId, redirectUri: input.redirectUri, state, codeChallenge: challenge }) };
}

export async function completeSlackOAuth(state: string, code: string) {
  const db = await getAdminClient();
  const stateRecord = await consumeOAuthState(db, state, "slack");
  const credentials = await readConnectionCredentials<{ clientId: string; clientSecret: string }>(db, stateRecord.connectionId, stateRecord.tenantId);
  const body = await exchangeAuthorizationCode({ code, clientId: credentials.clientId, clientSecret: credentials.clientSecret, redirectUri: stateRecord.redirectUri, codeVerifier: stateRecord.codeVerifier ?? "" });
  const token = body.access_token ?? body.authed_user?.access_token;
  const refreshToken = body.refresh_token ?? body.authed_user?.refresh_token;
  const expiresIn = Number(body.expires_in ?? body.authed_user?.expires_in ?? 43_200);
  if (!token || !refreshToken) throw new Error("Slack OAuth did not return the rotating access and refresh tokens. Enable token rotation for this Slack app.");
  const teamId = body.team?.id ?? body.enterprise?.id;
  await storeOAuthConnection(db, { connectionId: stateRecord.connectionId, tenantId: stateRecord.tenantId, provider: "slack", externalId: teamId, displayName: body.team?.name ?? "Slack workspace", credentials: { ...credentials, accessToken: token, refreshToken, tokenType: "Bearer", scopes: body.scope ?? body.authed_user?.scope ?? SLACK_SCOPES.join(",") }, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() });
  return { connectionId: stateRecord.connectionId, tenantId: stateRecord.tenantId, teamId };
}

export async function ensureSlackAccessToken(connectionId: string, tenantId: string) {
  const db = await getAdminClient();
  const credentials = await readConnectionCredentials<any>(db, connectionId, tenantId);
  if (credentials.accessToken && credentials.expiresAt && new Date(credentials.expiresAt).getTime() - Date.now() > 120_000) return credentials.accessToken;
  if (!credentials.refreshToken) { await markReconnectRequired(db, connectionId, "Slack token rotation credentials are missing. Reconnect required."); throw new Error("Slack reconnect required."); }
  try {
    const body = await refreshSlackAccessToken({ clientId: credentials.clientId, clientSecret: credentials.clientSecret, refreshToken: credentials.refreshToken });
    const token = body.access_token ?? body.authed_user?.access_token;
    const refreshToken = body.refresh_token ?? body.authed_user?.refresh_token;
    const expiresIn = Number(body.expires_in ?? body.authed_user?.expires_in ?? 43_200);
    if (!token || !refreshToken) throw new Error("Slack refresh did not return rotating credentials.");
    await storeOAuthConnection(db, { connectionId, tenantId, provider: "slack", externalId: credentials.teamId ?? null, displayName: credentials.displayName ?? "Slack workspace", credentials: { ...credentials, accessToken: token, refreshToken, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() }, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() });
    return token;
  } catch (error) {
    await markReconnectRequired(db, connectionId, "Slack token refresh failed. Reconnect required.");
    throw error;
  }
}
