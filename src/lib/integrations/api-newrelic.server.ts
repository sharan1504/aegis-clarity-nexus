import crypto from "node:crypto";
import { getAdminClient, readConnectionCredentials, storeOAuthConnection, markReconnectRequired } from "./oauth-framework.server";
import { encryptCredentials } from "./credential-vault.server";

export const NEW_RELIC_REGIONS = ["us", "eu", "jp"] as const;
export type NewRelicRegion = (typeof NEW_RELIC_REGIONS)[number];

function nerdGraphUrl(region: NewRelicRegion) {
  if (region === "eu") return "https://api.eu.newrelic.com/graphql";
  if (region === "jp") return "https://api.jp.newrelic.com/graphql";
  return "https://api.newrelic.com/graphql";
}

async function validateNewRelicKey(apiKey: string, region: NewRelicRegion) {
  const response = await fetch(nerdGraphUrl(region), {
    method: "POST",
    headers: { "content-type": "application/json", "API-Key": apiKey },
    body: JSON.stringify({ query: "{ requestContext { userId apiKey } actor { user { name email } } }" }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`New Relic NerdGraph validation failed (${response.status}): ${text.slice(0, 300)}`);
  const body = JSON.parse(text) as any;
  if (body.errors?.length) throw new Error(`New Relic NerdGraph rejected the API key: ${String(body.errors[0]?.message ?? "unknown error")}`);
  return body.data?.actor?.user ?? body.data?.requestContext ?? {};
}

export async function connectNewRelic(input: { tenantId: string; apiKey: string; region?: NewRelicRegion; connectionId?: string; displayName?: string; environment?: string }) {
  const db = await getAdminClient();
  const connectionId = input.connectionId ?? crypto.randomUUID();
  const region = input.region ?? "us";
  const identity = await validateNewRelicKey(input.apiKey, region);
  await db.from("provider_connections").upsert({
    id: connectionId,
    tenant_id: input.tenantId,
    provider: "newrelic",
    display_name: input.displayName ?? identity.name ?? "New Relic",
    environment: input.environment ?? "Production",
    status: "connected",
    encrypted_credentials: encryptCredentials({ provider: "newrelic", apiKey: input.apiKey, region }),
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  return { connectionId, tenantId: input.tenantId, provider: "newrelic", displayName: input.displayName ?? identity.name ?? "New Relic", region, identity };
}

export async function ensureNewRelicApiKey(connectionId: string, tenantId: string) {
  const db = await getAdminClient();
  const credentials = await readConnectionCredentials<{ apiKey: string; region?: NewRelicRegion }>(db, connectionId, tenantId);
  if (!credentials.apiKey) {
    await markReconnectRequired(db, connectionId, "New Relic API key is missing. Reconnect required.");
    throw new Error("New Relic reconnect required.");
  }
  try {
    await validateNewRelicKey(credentials.apiKey, credentials.region ?? "us");
    return { apiKey: credentials.apiKey, region: credentials.region ?? "us" };
  } catch (error) {
    await markReconnectRequired(db, connectionId, "New Relic API key validation failed. Reconnect required.");
    throw error;
  }
}
