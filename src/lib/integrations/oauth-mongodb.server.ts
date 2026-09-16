import crypto from "node:crypto";
import { getAdminClient, readConnectionCredentials, storeOAuthConnection, markReconnectRequired } from "./oauth-framework.server";
import { encryptCredentials } from "./credential-vault.server";

export const MONGODB_ATLAS_TOKEN_URL = "https://cloud.mongodb.com/api/oauth/token";
export const MONGODB_ATLAS_ORGS_URL = "https://cloud.mongodb.com/api/atlas/v2/orgs";

export type MongoDbAtlasCredentials = {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  expiresAt: string;
  externalId?: string | null;
  displayName?: string;
  environment?: string;
};

async function tokenRequest(clientId: string, clientSecret: string) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(MONGODB_ATLAS_TOKEN_URL, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: "grant_type=client_credentials" });
  const text = await response.text();
  if (!response.ok) throw new Error(`MongoDB Atlas token request failed (${response.status}): ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as any;
  if (!json.access_token) throw new Error("MongoDB Atlas did not return an access token.");
  return { accessToken: json.access_token as string, expiresAt: new Date(Date.now() + Number(json.expires_in ?? 3600) * 1000).toISOString() };
}

async function validateAccess(accessToken: string) {
  const response = await fetch(MONGODB_ATLAS_ORGS_URL, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.atlas.2025-03-12+json" } });
  const text = await response.text();
  if (!response.ok) throw new Error(`MongoDB Atlas validation failed (${response.status}): ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as any;
  const firstOrg = Array.isArray(json?.results) ? json.results[0] : undefined;
  return { externalId: firstOrg?.id ?? null, displayName: firstOrg?.name ? `MongoDB Atlas — ${firstOrg.name}` : "MongoDB Atlas" };
}

export async function connectMongoDbAtlas(input: { tenantId: string; userId: string; connectionId?: string; clientId: string; clientSecret: string; displayName?: string; environment?: string }) {
  const token = await tokenRequest(input.clientId.trim(), input.clientSecret);
  const identity = await validateAccess(token.accessToken);
  const db = await getAdminClient();
  const connectionId = input.connectionId ?? crypto.randomUUID();
  const displayName = input.displayName?.trim() || identity.displayName;
  const environment = input.environment ?? "Production";
  const credentials: MongoDbAtlasCredentials = { clientId: input.clientId.trim(), clientSecret: input.clientSecret, accessToken: token.accessToken, expiresAt: token.expiresAt, externalId: identity.externalId, displayName, environment };
  await db.from("provider_connections").upsert({ id: connectionId, tenant_id: input.tenantId, provider: "mongodb", external_id: identity.externalId, display_name: displayName, environment, status: "connected", encrypted_credentials: encryptCredentials(credentials), credential_expires_at: token.expiresAt, last_error: null, connected_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_by: input.userId }, { onConflict: "id" });
  return { connectionId, displayName, expiresAt: token.expiresAt };
}

export async function ensureMongoDbAccessToken(connectionId: string, tenantId: string) {
  const db = await getAdminClient();
  const credentials = await readConnectionCredentials<MongoDbAtlasCredentials>(db, connectionId, tenantId);
  if (credentials.accessToken && credentials.expiresAt && new Date(credentials.expiresAt).getTime() - Date.now() > 120_000) return credentials.accessToken;
  try {
    const token = await tokenRequest(credentials.clientId, credentials.clientSecret);
    await storeOAuthConnection(db, { connectionId, tenantId, provider: "mongodb", externalId: credentials.externalId, displayName: credentials.displayName ?? "MongoDB Atlas", environment: credentials.environment ?? "Production", credentials: { ...credentials, accessToken: token.accessToken, expiresAt: token.expiresAt }, expiresAt: token.expiresAt });
    return token.accessToken;
  } catch (error) {
    await markReconnectRequired(db, connectionId, "MongoDB Atlas service-account token generation failed. Reconnect required.");
    throw error;
  }
}
