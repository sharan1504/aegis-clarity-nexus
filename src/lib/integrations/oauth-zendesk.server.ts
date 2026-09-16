import crypto from "node:crypto";
import { consumeOAuthState, createOAuthState, getAdminClient, markReconnectRequired, readConnectionCredentials, storeOAuthConnection, assertFreshExpiry } from "./oauth-framework.server";

export const ZENDESK_SCOPES = ["tickets:read", "users:read", "organizations:read"] as const;

type ZendeskCredentials = { clientId: string; clientSecret: string; subdomain: string; accessToken?: string; refreshToken?: string; expiresAt?: string; userId?: string; userEmail?: string; scopes?: string[]; displayName?: string };

function normalizeSubdomain(value: string) {
  const stripped = value.trim().replace(/^https?:\/\//, "").split(".")[0];
  if (!/^[a-zA-Z0-9-]+$/.test(stripped)) throw new Error("Zendesk subdomain is invalid.");
  return stripped;
}
function origin(subdomain: string) { return `https://${normalizeSubdomain(subdomain)}.zendesk.com`; }
function form(data: Record<string, string>) { return new URLSearchParams(data); }

export function buildZendeskAuthorizeUrl(input: { subdomain: string; clientId: string; redirectUri: string; state: string; codeChallenge?: string }) {
  const url = new URL(`${origin(input.subdomain)}/oauth/authorizations/new`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId.trim());
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", ZENDESK_SCOPES.join(" "));
  url.searchParams.set("state", input.state);
  if (input.codeChallenge) {
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

async function tokenRequest(subdomain: string, body: URLSearchParams) {
  const response = await fetch(`${origin(subdomain)}/oauth/tokens`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body });
  const text = await response.text();
  if (!response.ok) throw new Error(`Zendesk OAuth token request failed (${response.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text) as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string };
}

async function discoverIdentity(subdomain: string, accessToken: string) {
  const response = await fetch(`${origin(subdomain)}/api/v2/users/me.json`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Zendesk identity validation failed (${response.status}): ${text.slice(0, 300)}`);
  const body = JSON.parse(text) as { user?: { id?: number; email?: string; name?: string } };
  return body.user ?? {};
}

export async function startZendeskOAuth(input: { tenantId: string; connectionId?: string; subdomain: string; clientId: string; clientSecret: string; redirectUri: string; displayName?: string; environment?: string }) {
  const subdomain = normalizeSubdomain(input.subdomain);
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  if (!clientId || !clientSecret) throw new Error("Zendesk global OAuth client ID and client secret are required.");
  const db = await getAdminClient();
  const connectionId = input.connectionId ?? crypto.randomUUID();
  await storeOAuthConnection(db, { connectionId, tenantId: input.tenantId, provider: "zendesk", displayName: input.displayName ?? `Zendesk (${subdomain})`, environment: input.environment ?? "Production", status: "failed", credentials: { provider: "zendesk", clientId, clientSecret, subdomain, displayName: input.displayName }, expiresAt: null });
  const state = await createOAuthState(db, { tenantId: input.tenantId, provider: "zendesk", redirectUri: input.redirectUri, connectionId });
  return { connectionId, authorizeUrl: buildZendeskAuthorizeUrl({ subdomain, clientId, redirectUri: input.redirectUri, state }) };
}

export async function completeZendeskOAuth(state: string, code: string) {
  const db = await getAdminClient();
  const stateRecord = await consumeOAuthState(db, state, "zendesk");
  const credentials = await readConnectionCredentials<ZendeskCredentials>(db, stateRecord.connectionId, stateRecord.tenantId);
  const tokens = await tokenRequest(credentials.subdomain, form({ grant_type: "authorization_code", code, client_id: credentials.clientId, client_secret: credentials.clientSecret, redirect_uri: stateRecord.redirectUri, scope: ZENDESK_SCOPES.join(" ") }));
  const user = await discoverIdentity(credentials.subdomain, tokens.access_token);
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in ?? 1800) * 1000).toISOString();
  await storeOAuthConnection(db, { connectionId: stateRecord.connectionId, tenantId: stateRecord.tenantId, provider: "zendesk", externalId: user.id ? String(user.id) : null, displayName: credentials.displayName ?? user.name ?? `Zendesk (${credentials.subdomain})`, credentials: { ...credentials, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt, userId: user.id ? String(user.id) : undefined, userEmail: user.email, scopes: tokens.scope?.split(/\s+/).filter(Boolean) ?? [...ZENDESK_SCOPES] }, expiresAt });
  return { connectionId: stateRecord.connectionId, displayName: credentials.displayName ?? user.name ?? `Zendesk (${credentials.subdomain})` };
}

export async function ensureZendeskAccessToken(connectionId: string, tenantId: string) {
  const db = await getAdminClient();
  const credentials = await readConnectionCredentials<ZendeskCredentials>(db, connectionId, tenantId);
  if (credentials.accessToken && assertFreshExpiry(credentials.expiresAt)) return credentials.accessToken;
  if (!credentials.refreshToken) { await markReconnectRequired(db, connectionId, "Zendesk access expired and no refresh token is available. Reconnect required."); throw new Error("Zendesk reconnect required."); }
  const tokens = await tokenRequest(credentials.subdomain, form({ grant_type: "refresh_token", refresh_token: credentials.refreshToken, client_id: credentials.clientId, client_secret: credentials.clientSecret, scope: ZENDESK_SCOPES.join(" ") }));
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in ?? 1800) * 1000).toISOString();
  await storeOAuthConnection(db, { connectionId, tenantId, provider: "zendesk", externalId: credentials.userId ?? null, displayName: credentials.displayName ?? `Zendesk (${credentials.subdomain})`, credentials: { ...credentials, accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? credentials.refreshToken, expiresAt, scopes: tokens.scope?.split(/\s+/).filter(Boolean) ?? credentials.scopes }, expiresAt });
  return tokens.access_token;
}
