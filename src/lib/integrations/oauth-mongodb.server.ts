import crypto from "node:crypto";
import { getAdminClient, readConnectionCredentials, storeOAuthConnection, markReconnectRequired } from "./oauth-framework.server";
import { encryptCredentials } from "./credential-vault.server";

const TOKEN_URL = "https://cloud.mongodb.com/api/oauth/token";
const ORGS_URL = "https://cloud.mongodb.com/api/atlas/v2/orgs";

async function tokenRequest(clientId: string, clientSecret: string) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(TOKEN_URL, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: "grant_type=client_credentials" });
  const text = await response.text(); if (!response.ok) throw new Error(`MongoDB Atlas token request failed (${response.status}): ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as any; if (!json.access_token) throw new Error("MongoDB Atlas did not return an access token.");
  return { accessToken: json.access_token as string, expiresAt: new Date(Date.now() + Number(json.expires_in ?? 3600) * 1000).toISOString() };
}

async function validateAccess(accessToken: string) {
  const response = await fetch(ORGS_URL, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.atlas.2025-03-12+json" } });
  const text = await response.text(); if (!response.ok) throw new Error(`MongoDB Atlas validation failed (${response.status}): ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as any; return { externalId: json?.links?.[0]?.href ?? null, displayName: json?.links?.[0]?.href ? "MongoDB Atlas" : "MongoDB Atlas" };
}

export async function connectMongoDbAtlas(input: { tenantId: string; userId: string; connectionId?: string; clientId: string; clientSecret: string; displayName?: string; environment?: string }) {
  const token = await tokenRequest(input.clientId.trim(), input.clientSecret);
  const identity = await validateAccess(token.accessToken);
  const db = await getAdminClient(); const connectionId = input.connectionId ?? crypto.randomUUID();
  await db.from("provider_connections").upsert({ id: connectionId, tenant_id: input.tenantId, provider: "mongodb", external_id: identity.externalId, display_name: input.displayName?.trim() || identity.displayName, environment: input.environment ?? "Production", status: "connected", encrypted_credentials: encryptCredentials({ clientId: input.clientId.trim(), clientSecret: input.clientSecret, accessToken: token.accessToken, expiresAt: token.expiresAt }), credential_expires_at: token.expiresAt, last_error: null, connected_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_by: input.userId }, { onConflict: "id" });
  return { connectionId, displayName: identity.displayName, expiresAt: token.expiresAt };
}

export async function ensureMongoDbAccessToken(connectionId: string, tenantId: string) {
  const db = await getAdminClient(); const credentials = await readConnectionCredentials<any>(db, connectionId, tenantId);
  if (credentials.accessToken && credentials.expiresAt && new Date(credentials.expiresAt).getTime() - Date.now() > 120_000) return credentials.accessToken;
  try { const token = await tokenRequest(credentials.clientId, credentials.clientSecret); await storeOAuthConnection(db, { connectionId, tenantId, provider: "mongodb", externalId: credentials.externalId, displayName: credentials.displayName ?? "MongoDB Atlas", credentials: { ...credentials, accessToken: token.accessToken, expiresAt: token.expiresAt }, expiresAt: token.expiresAt }); return token.accessToken; } catch (error) { await markReconnectRequired(db, connectionId, "MongoDB Atlas service-account token generation failed. Reconnect required."); throw error; }
}
