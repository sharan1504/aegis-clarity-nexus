import crypto from "node:crypto";
import { createOAuthState, consumeOAuthState, getAdminClient, markReconnectRequired, readConnectionCredentials, storeOAuthConnection, assertFreshExpiry } from "./oauth-framework.server";

const AUTHORIZE_URL = "https://app.hubspot.com/oauth/authorize";
const TOKEN_URL = "https://api.hubapi.com/oauth/2026-03/token";
const INTROSPECT_URL = "https://api.hubapi.com/oauth/2026-03/token/introspect";
const REVOKE_URL = "https://api.hubapi.com/oauth/2026-03/token/revoke";

export const HUBSPOT_SCOPES = ["crm.objects.contacts.read", "crm.objects.companies.read", "crm.objects.deals.read", "crm.objects.tickets.read"] as const;

type HubSpotCredentials = { clientId: string; clientSecret: string; accessToken?: string; refreshToken?: string; expiresAt?: string; hubId?: string; userId?: string; scopes?: string[] };

function form(data: Record<string, string>) { return new URLSearchParams(data); }

async function tokenRequest(body: URLSearchParams) {
  const response = await fetch(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const text = await response.text();
  if (!response.ok) throw new Error(`HubSpot OAuth token request failed (${response.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text) as { access_token: string; refresh_token?: string; expires_in?: number; hub_id?: number; user_id?: number; scopes?: string[] };
}

export function buildHubSpotAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string }) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("scope", HUBSPOT_SCOPES.join(" "));
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  return url.toString();
}

async function exchangeCode(input: { code: string; clientId: string; clientSecret: string; redirectUri: string }) {
  return tokenRequest(form({ grant_type: "authorization_code", code: input.code, redirect_uri: input.redirectUri, client_id: input.clientId, client_secret: input.clientSecret }));
}

async function introspect(input: { token: string; tokenTypeHint: "access_token" | "refresh_token"; clientId: string; clientSecret: string }) {
  const body: Record<string, string> = { client_id: input.clientId, client_secret: input.clientSecret, token_type_hint: input.tokenTypeHint, token: input.token };
  if (input.tokenTypeHint === "refresh_token") body.refresh_token = input.token;
  const response = await fetch(INTROSPECT_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form(body) });
  const text = await response.text();
  if (!response.ok) throw new Error(`HubSpot token introspection failed (${response.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text) as { active?: boolean; hub_id?: number; user_id?: number; scopes?: string[] };
}

export async function startHubSpotOAuth(input: { tenantId: string; connectionId?: string; clientId: string; clientSecret: string; redirectUri: string; displayName?: string; environment?: string }) {
  const db = await getAdminClient();
  const connectionId = input.connectionId ?? crypto.randomUUID();
  await storeOAuthConnection(db, { connectionId, tenantId: input.tenantId, provider: "hubspot", displayName: input.displayName ?? "HubSpot", environment: input.environment ?? "Production", status: "failed", credentials: { provider: "hubspot", clientId: input.clientId.trim(), clientSecret: input.clientSecret }, expiresAt: null });
  await db.from("provider_connections").update({ last_error: "OAuth authorization in progress", connected_at: null, updated_at: new Date().toISOString() }).eq("id", connectionId).eq("tenant_id", input.tenantId);
  const state = await createOAuthState(db, { tenantId: input.tenantId, provider: "hubspot", redirectUri: input.redirectUri, connectionId });
  return { connectionId, authorizeUrl: buildHubSpotAuthorizeUrl({ clientId: input.clientId.trim(), redirectUri: input.redirectUri, state }) };
}

export async function completeHubSpotOAuth(state: string, code: string) {
  const db = await getAdminClient();
  const stateRecord = await consumeOAuthState(db, state, "hubspot");
  const credentials = await readConnectionCredentials<HubSpotCredentials>(db, stateRecord.connectionId, stateRecord.tenantId);
  const tokens = await exchangeCode({ code, clientId: credentials.clientId, clientSecret: credentials.clientSecret, redirectUri: stateRecord.redirectUri });
  const metadata = await introspect({ token: tokens.access_token, tokenTypeHint: "access_token", clientId: credentials.clientId, clientSecret: credentials.clientSecret });
  const scopes = tokens.scopes ?? metadata.scopes ?? [...HUBSPOT_SCOPES];
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in ?? 1800) * 1000).toISOString();
  await storeOAuthConnection(db, { connectionId: stateRecord.connectionId, tenantId: stateRecord.tenantId, provider: "hubspot", externalId: metadata.hub_id ? String(metadata.hub_id) : tokens.hub_id ? String(tokens.hub_id) : null, displayName: credentials.displayName ?? (metadata.hub_id ? `HubSpot ${metadata.hub_id}` : "HubSpot"), credentials: { ...credentials, accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? null, expiresAt, hubId: String(metadata.hub_id ?? tokens.hub_id ?? ""), userId: String(metadata.user_id ?? tokens.user_id ?? ""), scopes }, expiresAt });
  return { connectionId: stateRecord.connectionId, displayName: credentials.displayName ?? (metadata.hub_id ? `HubSpot ${metadata.hub_id}` : "HubSpot"), hubId: String(metadata.hub_id ?? tokens.hub_id ?? "") };
}

export async function ensureHubSpotAccessToken(connectionId: string, tenantId: string) {
  const db = await getAdminClient();
  const credentials = await readConnectionCredentials<HubSpotCredentials>(db, connectionId, tenantId);
  if (credentials.accessToken && assertFreshExpiry(credentials.expiresAt)) return credentials.accessToken;
  if (!credentials.refreshToken) { await markReconnectRequired(db, connectionId, "HubSpot access expired and no refresh token is available. Reconnect required."); throw new Error("HubSpot reconnect required."); }
  const tokens = await tokenRequest(form({ grant_type: "refresh_token", refresh_token: credentials.refreshToken, client_id: credentials.clientId, client_secret: credentials.clientSecret }));
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in ?? 1800) * 1000).toISOString();
  await storeOAuthConnection(db, { connectionId, tenantId, provider: "hubspot", externalId: credentials.hubId ?? null, displayName: credentials.displayName ?? "HubSpot", credentials: { ...credentials, accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? credentials.refreshToken, expiresAt, scopes: tokens.scopes ?? credentials.scopes }, expiresAt });
  return tokens.access_token;
}

export async function revokeHubSpotOAuth(connectionId: string, tenantId: string) {
  const db = await getAdminClient();
  const credentials = await readConnectionCredentials<HubSpotCredentials>(db, connectionId, tenantId);
  const token = credentials.refreshToken ?? credentials.accessToken;
  if (token) await fetch(REVOKE_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ client_id: credentials.clientId, client_secret: credentials.clientSecret, token, token_type_hint: credentials.refreshToken ? "refresh_token" : "access_token" }) });
  await db.from("provider_connections").update({ status: "disconnected", encrypted_credentials: null, last_error: null, updated_at: new Date().toISOString() }).eq("id", connectionId).eq("tenant_id", tenantId);
}
