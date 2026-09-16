import crypto from "node:crypto";
import { getAdminClient, storeOAuthConnection, readConnectionCredentials, assertFreshExpiry, markReconnectRequired } from "./oauth-framework.server";

export const SAP_GRANT_TYPE = "client_credentials" as const;

type SapCredentials = {
  tokenUrl: string;
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  expiresAt?: string;
  scope?: string;
  displayName?: string;
};

function httpsUrl(value: string, field: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:") throw new Error(`${field} must use HTTPS.`);
  return url;
}

async function tokenRequest(credentials: SapCredentials) {
  const tokenUrl = httpsUrl(credentials.tokenUrl, "SAP token URL");
  const basic = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64");
  const body = new URLSearchParams({ grant_type: SAP_GRANT_TYPE });
  if (credentials.scope?.trim()) body.set("scope", credentials.scope.trim());
  const response = await fetch(tokenUrl, { method: "POST", headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body });
  const text = await response.text();
  if (!response.ok) throw new Error(`SAP OAuth token request failed (${response.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text) as { access_token: string; token_type?: string; expires_in?: number; scope?: string };
}

async function validateAccess(credentials: SapCredentials, accessToken: string) {
  const apiBase = httpsUrl(credentials.apiBaseUrl, "SAP API base URL").origin + new URL(credentials.apiBaseUrl).pathname.replace(/\/$/, "");
  const response = await fetch(apiBase, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SAP API validation failed (${response.status}): ${text.slice(0, 300)}`);
  }
}

export async function connectSap(input: { tenantId: string; userId: string; connectionId?: string; tokenUrl: string; apiBaseUrl: string; clientId: string; clientSecret: string; scope?: string; displayName?: string; environment?: string }) {
  const tokenUrl = httpsUrl(input.tokenUrl, "SAP token URL").toString();
  const apiBaseUrl = httpsUrl(input.apiBaseUrl, "SAP API base URL").toString().replace(/\/$/, "");
  const credentials: SapCredentials = { tokenUrl, apiBaseUrl, clientId: input.clientId.trim(), clientSecret: input.clientSecret.trim(), scope: input.scope?.trim(), displayName: input.displayName };
  const tokens = await tokenRequest(credentials);
  await validateAccess(credentials, tokens.access_token);
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString();
  const connectionId = input.connectionId ?? crypto.randomUUID();
  const db = await getAdminClient();
  await storeOAuthConnection(db, { connectionId, tenantId: input.tenantId, provider: "sap", externalId: new URL(apiBaseUrl).hostname, displayName: input.displayName ?? `SAP (${new URL(apiBaseUrl).hostname})`, environment: input.environment ?? "Production", credentials: { ...credentials, accessToken: tokens.access_token, expiresAt, scope: tokens.scope ?? credentials.scope }, expiresAt });
  return { connectionId, externalId: new URL(apiBaseUrl).hostname };
}

export async function ensureSapAccessToken(connectionId: string, tenantId: string) {
  const db = await getAdminClient();
  const credentials = await readConnectionCredentials<SapCredentials>(db, connectionId, tenantId);
  if (credentials.accessToken && assertFreshExpiry(credentials.expiresAt)) return credentials.accessToken;
  const tokens = await tokenRequest(credentials);
  await validateAccess(credentials, tokens.access_token);
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString();
  await storeOAuthConnection(db, { connectionId, tenantId, provider: "sap", externalId: new URL(credentials.apiBaseUrl).hostname, displayName: credentials.displayName ?? `SAP (${new URL(credentials.apiBaseUrl).hostname})`, credentials: { ...credentials, accessToken: tokens.access_token, expiresAt, scope: tokens.scope ?? credentials.scope }, expiresAt });
  return tokens.access_token;
}

export async function disconnectSap(connectionId: string, tenantId: string) {
  const db = await getAdminClient();
  await markReconnectRequired(db, connectionId, "SAP connection disconnected. Reconnect required.");
}
