import crypto from "node:crypto";
import { getAdminClient } from "./oauth-framework.server";
import { encryptCredentials } from "./credential-vault.server";

export type OktaCredentials = {
  baseUrl: string;
  apiToken: string;
};

function normalizeBaseUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:") throw new Error("Okta domain must use HTTPS.");
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

async function validateOkta(input: OktaCredentials) {
  const response = await fetch(`${input.baseUrl}/api/v1/meta/types/user`, {
    headers: { accept: "application/json", authorization: `SSWS ${input.apiToken}` },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Okta API token validation failed (${response.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text) as { name?: string };
}

export async function connectOkta(input: { tenantId: string; userId: string; connectionId?: string; baseUrl: string; apiToken: string; displayName?: string; environment?: string }) {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const token = input.apiToken.trim();
  if (!token) throw new Error("Okta API token is required.");
  await validateOkta({ baseUrl, apiToken: token });
  const db = await getAdminClient();
  const connectionId = input.connectionId ?? crypto.randomUUID();
  const displayName = input.displayName?.trim() || new URL(baseUrl).hostname;
  const { error } = await db.from("provider_connections").upsert({
    id: connectionId,
    tenant_id: input.tenantId,
    provider: "okta",
    external_id: new URL(baseUrl).hostname,
    display_name: displayName,
    environment: input.environment ?? "Production",
    status: "connected",
    encrypted_credentials: encryptCredentials({ baseUrl, apiToken: token }),
    credential_expires_at: null,
    last_error: null,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: input.userId,
  }, { onConflict: "id" });
  if (error) throw new Error(`Unable to store Okta connection: ${error.message}`);
  return { connectionId, displayName };
}
