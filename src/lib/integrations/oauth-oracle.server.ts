import crypto from "node:crypto";
import { getAdminClient, storeOAuthConnection, readConnectionCredentials, assertFreshExpiry } from "./oauth-framework.server";

export const ORACLE_GRANT_TYPE = "client_credentials" as const;
export const ORACLE_TOKEN_PATH = "/oauth2/v1/token";
export const ORACLE_VALIDATION_PATH = "/admin/v1/Apps?count=1";

type OracleCredentials = {
  identityDomainUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  accessToken?: string;
  expiresAt?: string;
  displayName?: string;
};

function normalizeHttpsUrl(value: string, field: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:") throw new Error(`${field} must use HTTPS.`);
  return url.origin;
}

function tokenUrl(identityDomainUrl: string) {
  return `${identityDomainUrl}${ORACLE_TOKEN_PATH}`;
}

async function requestToken(credentials: OracleCredentials) {
  const basic = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64");
  const response = await fetch(tokenUrl(credentials.identityDomainUrl), {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: ORACLE_GRANT_TYPE, scope: credentials.scope }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Oracle OAuth token request failed (${response.status}): ${text.slice(0, 300)}`);
  const body = JSON.parse(text) as { access_token?: string; token_type?: string; expires_in?: number; scope?: string };
  if (!body.access_token) throw new Error("Oracle OAuth token response did not contain an access token.");
  return body;
}

async function validateIdentityDomainAccess(credentials: OracleCredentials, accessToken: string) {
  const response = await fetch(`${credentials.identityDomainUrl}${ORACLE_VALIDATION_PATH}`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      "content-type": "application/scim+json",
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Oracle Identity Domains validation failed (${response.status}): ${text.slice(0, 300)}`);
}

export async function connectOracle(input: {
  tenantId: string;
  userId: string;
  connectionId?: string;
  identityDomainUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  displayName?: string;
  environment?: string;
}) {
  const identityDomainUrl = normalizeHttpsUrl(input.identityDomainUrl, "Oracle identity domain URL");
  const credentials: OracleCredentials = {
    identityDomainUrl,
    clientId: input.clientId.trim(),
    clientSecret: input.clientSecret.trim(),
    scope: input.scope.trim(),
    displayName: input.displayName,
  };
  if (!credentials.clientId || !credentials.clientSecret || !credentials.scope) {
    throw new Error("Oracle client ID, client secret, and OAuth scope are required.");
  }

  const tokens = await requestToken(credentials);
  await validateIdentityDomainAccess(credentials, tokens.access_token!);
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString();
  const connectionId = input.connectionId ?? crypto.randomUUID();
  const db = await getAdminClient();
  await storeOAuthConnection(db, {
    connectionId,
    tenantId: input.tenantId,
    provider: "oracle",
    externalId: new URL(identityDomainUrl).hostname,
    displayName: input.displayName?.trim() || `Oracle (${new URL(identityDomainUrl).hostname})`,
    environment: input.environment ?? "Production",
    credentials: { ...credentials, accessToken: tokens.access_token, expiresAt, scope: tokens.scope ?? credentials.scope },
    expiresAt,
  });
  return { connectionId, externalId: new URL(identityDomainUrl).hostname };
}

export async function ensureOracleAccessToken(connectionId: string, tenantId: string) {
  const db = await getAdminClient();
  const credentials = await readConnectionCredentials<OracleCredentials>(db, connectionId, tenantId);
  if (credentials.accessToken && assertFreshExpiry(credentials.expiresAt)) return credentials.accessToken;
  const tokens = await requestToken(credentials);
  await validateIdentityDomainAccess(credentials, tokens.access_token!);
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString();
  await storeOAuthConnection(db, {
    connectionId,
    tenantId,
    provider: "oracle",
    externalId: new URL(credentials.identityDomainUrl).hostname,
    displayName: credentials.displayName ?? `Oracle (${new URL(credentials.identityDomainUrl).hostname})`,
    credentials: { ...credentials, accessToken: tokens.access_token, expiresAt, scope: tokens.scope ?? credentials.scope },
    expiresAt,
  });
  return tokens.access_token;
}
