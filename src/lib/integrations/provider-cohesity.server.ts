import crypto from "node:crypto";
import { getAdminClient } from "./oauth-framework.server";
import { encryptCredentials } from "./credential-vault.server";

export type CohesityCredentials = { baseUrl: string; apiKey: string };

function normalizeBaseUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:") throw new Error("Cohesity API URL must use HTTPS.");
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

async function validateCohesity(input: CohesityCredentials) {
  const response = await fetch(`${input.baseUrl}/irisservices/api/v1/public/userInfo`, {
    headers: { accept: "application/json", authorization: `Bearer ${input.apiKey}` },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Cohesity API validation failed (${response.status}): ${text.slice(0, 300)}`);
}

export async function connectCohesity(input: { tenantId: string; userId: string; connectionId?: string; baseUrl: string; apiKey: string; displayName?: string; environment?: string }) {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error("Cohesity API key is required.");
  await validateCohesity({ baseUrl, apiKey });
  const db = await getAdminClient();
  const connectionId = input.connectionId ?? crypto.randomUUID();
  const displayName = input.displayName?.trim() || new URL(baseUrl).hostname;
  const { error } = await db.from("provider_connections").upsert({
    id: connectionId,
    tenant_id: input.tenantId,
    provider: "cohesity",
    external_id: new URL(baseUrl).hostname,
    display_name: displayName,
    environment: input.environment ?? "Production",
    status: "connected",
    encrypted_credentials: encryptCredentials({ baseUrl, apiKey }),
    credential_expires_at: null,
    last_error: null,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: input.userId,
  }, { onConflict: "id" });
  if (error) throw new Error(`Unable to store Cohesity connection: ${error.message}`);
  return { connectionId, displayName };
}
