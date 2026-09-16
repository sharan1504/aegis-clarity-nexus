import crypto from "node:crypto";
import { createOAuthState, consumeOAuthState, getAdminClient, markReconnectRequired, readConnectionCredentials, storeOAuthConnection, assertFreshExpiry } from "./oauth-framework.server";

export const FRESHWORKS_SCOPES = ["freshservice.tickets.view", "freshservice.tickets.edit", "freshservice.tickets.conversations.create"] as const;

type FreshworksCredentials = { orgUrl: string; clientId: string; clientSecret: string; accessToken?: string; refreshToken?: string; expiresAt?: string; scopes?: string[]; displayName?: string };

function normalizeOrgUrl(value: string) {
  const raw = value.trim();
  if (!raw) throw new Error("Freshservice organization URL is required.");
  const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  if (url.protocol !== "https:") throw new Error("Freshservice organization URL must use HTTPS.");
  return url.origin;
}

function form(data: Record<string, string>) { return new URLSearchParams(data); }

async function tokenRequest(orgUrl: string, body: URLSearchParams, clientId: string, clientSecret: string) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${orgUrl}/org/oauth/v2/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}`, accept: "application/json" }, body });
  const text = await response.text();
  if (!response.ok) throw new Error(`Freshservice OAuth token request failed (${response.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text) as { access_token: string; refresh_token?: string; expires_in?: number; token_type?: string; scope?: string };
}

async function validateAccess(orgUrl: string, accessToken: string) {
  const response = await fetch(`${orgUrl}/api/v2/tickets?per_page=1`, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Freshservice access validation failed (${response.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text) as { tickets?: unknown[] };
}

export function buildFreshworksAuthorizeUrl(input: { orgUrl: string; clientId: string; redirectUri: string; state: string }) {
  const url = new URL(`${normalizeOrgUrl(input.orgUrl)}/org/oauth/v2/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId.trim());
  url.searchParams.set("scope", FRESHWORKS_SCOPES.join(" "));
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  return url.toString();
}

async function exchangeCode(input: { orgUrl: string; code: string; clientId: string; clientSecret: string; redirectUri: string }) {
  return tokenRequest(input.orgUrl, form({ code: input.code, grant_type: "authorization_code", redirect_uri: input.redirectUri }), input.clientId, input.clientSecret);
}

export async function startFreshworksOAuth(input: { tenantId: string; connectionId?: string; orgUrl: string; clientId: string; clientSecret: string; redirectUri: string; displayName?: string; environment?: string }) {
  const db = await getAdminClient();
  const orgUrl = normalizeOrgUrl(input.orgUrl);
  const connectionId = input.connectionId ?? crypto.randomUUID();
  await storeOAuthConnection(db, { connectionId, tenantId: input.tenantId, provider: "freshworks", displayName: input.displayName ?? "Freshservice", environment: input.environment ?? "Production", status: "failed", credentials: { provider: "freshworks", orgUrl, clientId: input.clientId.trim(), clientSecret: input.clientSecret.trim(), displayName: input.displayName }, expiresAt: null });
  await db.from("provider_connections").update({ last_error: "OAuth authorization in progress", connected_at: null, updated_at: new Date().toISOString() }).eq("id", connectionId).eq("tenant_id", input.tenantId);
  const state = await createOAuthState(db, { tenantId: input.tenantId, provider: "freshworks", redirectUri: input.redirectUri, connectionId });
  return { connectionId, authorizeUrl: buildFreshworksAuthorizeUrl({ orgUrl, clientId: input.clientId, redirectUri: input.redirectUri, state }) };
}

export async function completeFreshworksOAuth(state: string, code: string) {
  const db = await getAdminClient();
  const stateRecord = await consumeOAuthState(db, state, "freshworks");
  const credentials = await readConnectionCredentials<FreshworksCredentials>(db, stateRecord.connectionId, stateRecord.tenantId);
  const tokens = await exchangeCode({ orgUrl: credentials.orgUrl, code, clientId: credentials.clientId, clientSecret: credentials.clientSecret, redirectUri: stateRecord.redirectUri });
  await validateAccess(credentials.orgUrl, tokens.access_token);
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in ?? 1800) * 1000).toISOString();
  const scopes = tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : [...FRESHWORKS_SCOPES];
  const displayName = credentials.displayName ?? "Freshservice";
  await storeOAuthConnection(db, { connectionId: stateRecord.connectionId, tenantId: stateRecord.tenantId, provider: "freshworks", externalId: credentials.orgUrl, displayName, credentials: { ...credentials, accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? null, expiresAt, scopes }, expiresAt });
  return { connectionId: stateRecord.connectionId, displayName, externalId: credentials.orgUrl, orgUrl: credentials.orgUrl };
}

export async function ensureFreshworksAccessToken(connectionId: string, tenantId: string) {
  const db = await getAdminClient();
  const credentials = await readConnectionCredentials<FreshworksCredentials>(db, connectionId, tenantId);
  if (credentials.accessToken && assertFreshExpiry(credentials.expiresAt)) return credentials.accessToken;
  if (!credentials.refreshToken) { await markReconnectRequired(db, connectionId, "Freshservice access expired and no refresh token is available. Reconnect required."); throw new Error("Freshservice reconnect required."); }
  const tokens = await tokenRequest(credentials.orgUrl, form({ grant_type: "refresh_token", refresh_token: credentials.refreshToken }), credentials.clientId, credentials.clientSecret);
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in ?? 1800) * 1000).toISOString();
  await storeOAuthConnection(db, { connectionId, tenantId, provider: "freshworks", externalId: credentials.orgUrl, displayName: credentials.displayName ?? "Freshservice", credentials: { ...credentials, accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? credentials.refreshToken, expiresAt, scopes: tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : credentials.scopes }, expiresAt });
  return tokens.access_token;
}
