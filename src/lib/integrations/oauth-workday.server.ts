import crypto from "node:crypto";
import { createOAuthState, consumeOAuthState, getAdminClient, markReconnectRequired, readConnectionCredentials, storeOAuthConnection, assertFreshExpiry, createPkcePair } from "./oauth-framework.server";

export const WORKDAY_SCOPES = ["staffing"] as const;
export const WORKDAY_AUTH_BASE_URLS = {
  us: "https://auth.api.workday.com",
  usWcp: "https://api.us.wcp.workday.com/auth",
  eu: "https://api.eu.wcp.workday.com/auth",
  sg: "https://api.sg.wcp.workday.com/auth",
  uk: "https://api.uk.wcp.workday.com/auth",
} as const;

type WorkdayRegion = keyof typeof WORKDAY_AUTH_BASE_URLS;
type WorkdayCredentials = {
  region: WorkdayRegion;
  tenantAlias: string;
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  displayName?: string;
};

function normalizeTenantAlias(value: string) {
  const tenantAlias = value.trim();
  if (!/^[A-Za-z0-9._-]+$/.test(tenantAlias)) throw new Error("Workday tenant alias contains unsupported characters.");
  return tenantAlias;
}

function form(data: Record<string, string>) { return new URLSearchParams(data); }

function authBase(region: WorkdayRegion) {
  return WORKDAY_AUTH_BASE_URLS[region];
}

async function tokenRequest(region: WorkdayRegion, body: URLSearchParams, clientId: string, clientSecret: string) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${authBase(region)}/v1/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}`, accept: "application/json" },
    body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Workday OAuth token request failed (${response.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text) as { access_token: string; refresh_token?: string; expires_in?: number; token_type?: string };
}

async function validateWorkdayAccess(credentials: WorkdayCredentials, accessToken: string) {
  const response = await fetch(`https://api.workday.com/common/v1/workers?limit=1`, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Workday REST validation failed (${response.status}): ${text.slice(0, 300)}`);
  return { tenantAlias: credentials.tenantAlias, body: text ? JSON.parse(text) : null };
}

export function buildWorkdayAuthorizeUrl(input: { region: WorkdayRegion; clientId: string; redirectUri: string; state: string; challenge: string }) {
  const url = new URL(`${authBase(input.region)}/v1/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId.trim());
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function exchangeCode(input: { region: WorkdayRegion; code: string; clientId: string; clientSecret: string; redirectUri: string; verifier: string }) {
  return tokenRequest(input.region, form({ grant_type: "authorization_code", code: input.code, redirect_uri: input.redirectUri, code_verifier: input.verifier }), input.clientId, input.clientSecret);
}

export async function startWorkdayOAuth(input: { tenantId: string; connectionId?: string; region: WorkdayRegion; tenantAlias: string; clientId: string; clientSecret: string; redirectUri: string; displayName?: string; environment?: string }) {
  const db = await getAdminClient();
  const tenantAlias = normalizeTenantAlias(input.tenantAlias);
  const connectionId = input.connectionId ?? crypto.randomUUID();
  const { verifier, challenge } = createPkcePair();
  await storeOAuthConnection(db, { connectionId, tenantId: input.tenantId, provider: "workday", displayName: input.displayName ?? `Workday (${tenantAlias})`, environment: input.environment ?? "Production", status: "failed", credentials: { provider: "workday", region: input.region, tenantAlias, clientId: input.clientId.trim(), clientSecret: input.clientSecret.trim(), displayName: input.displayName }, expiresAt: null });
  await db.from("provider_connections").update({ last_error: "OAuth authorization in progress", connected_at: null, updated_at: new Date().toISOString() }).eq("id", connectionId).eq("tenant_id", input.tenantId);
  const state = await createOAuthState(db, { tenantId: input.tenantId, provider: "workday", redirectUri: input.redirectUri, connectionId, codeVerifier: verifier, metadata: { tenantAlias } });
  return { connectionId, authorizeUrl: buildWorkdayAuthorizeUrl({ region: input.region, clientId: input.clientId, redirectUri: input.redirectUri, state, challenge }) };
}

export async function completeWorkdayOAuth(state: string, code: string) {
  const db = await getAdminClient();
  const stateRecord = await consumeOAuthState(db, state, "workday");
  const credentials = await readConnectionCredentials<WorkdayCredentials>(db, stateRecord.connectionId, stateRecord.tenantId);
  if (!stateRecord.codeVerifier) throw new Error("Workday PKCE verifier is missing. Please reconnect.");
  const tokens = await exchangeCode({ region: credentials.region, code, clientId: credentials.clientId, clientSecret: credentials.clientSecret, redirectUri: stateRecord.redirectUri, verifier: stateRecord.codeVerifier });
  await validateWorkdayAccess(credentials, tokens.access_token);
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString();
  const displayName = credentials.displayName ?? `Workday (${credentials.tenantAlias})`;
  await storeOAuthConnection(db, { connectionId: stateRecord.connectionId, tenantId: stateRecord.tenantId, provider: "workday", externalId: credentials.tenantAlias, displayName, credentials: { ...credentials, accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? credentials.refreshToken, expiresAt }, expiresAt });
  return { connectionId: stateRecord.connectionId, displayName, externalId: credentials.tenantAlias, tenantAlias: credentials.tenantAlias };
}

export async function ensureWorkdayAccessToken(connectionId: string, tenantId: string) {
  const db = await getAdminClient();
  const credentials = await readConnectionCredentials<WorkdayCredentials>(db, connectionId, tenantId);
  if (credentials.accessToken && assertFreshExpiry(credentials.expiresAt)) return credentials.accessToken;
  if (!credentials.refreshToken) { await markReconnectRequired(db, connectionId, "Workday access expired and no refresh token is available. Reconnect required."); throw new Error("Workday reconnect required."); }
  const tokens = await tokenRequest(credentials.region, form({ grant_type: "refresh_token", refresh_token: credentials.refreshToken }), credentials.clientId, credentials.clientSecret);
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString();
  await validateWorkdayAccess(credentials, tokens.access_token);
  await storeOAuthConnection(db, { connectionId, tenantId, provider: "workday", externalId: credentials.tenantAlias, displayName: credentials.displayName ?? `Workday (${credentials.tenantAlias})`, credentials: { ...credentials, accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? credentials.refreshToken, expiresAt }, expiresAt });
  return tokens.access_token;
}
