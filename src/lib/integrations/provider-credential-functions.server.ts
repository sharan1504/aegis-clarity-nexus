import crypto from "node:crypto";
import { getAdminClient } from "./oauth-framework.server";
import { encryptCredentials } from "./credential-vault.server";

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`Provider authentication failed (${response.status}): ${typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300)}`);
  return body;
}

export async function connectDatadog(input: { tenantId: string; userId: string; connectionId?: string; apiKey: string; appKey: string; site?: string; displayName?: string; environment?: string }) {
  const site = (input.site ?? "datadoghq.com").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const body = await requestJson(`https://api.${site}/api/v1/validate`, { headers: { "DD-API-KEY": input.apiKey.trim() } });
  if (body?.valid !== true) throw new Error("Datadog API key validation did not return valid=true.");
  await requestJson(`https://api.${site}/api/v2/api_keys/validate`, { headers: { "DD-API-KEY": input.apiKey.trim(), "DD-APPLICATION-KEY": input.appKey.trim() } });
  const db = await getAdminClient(); const connectionId = input.connectionId ?? crypto.randomUUID();
  await db.from("provider_connections").upsert({ id: connectionId, tenant_id: input.tenantId, provider: "datadog", external_id: site, display_name: input.displayName?.trim() || `Datadog (${site})`, environment: input.environment ?? "Production", status: "connected", encrypted_credentials: encryptCredentials({ apiKey: input.apiKey.trim(), appKey: input.appKey.trim(), site }), last_error: null, connected_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_by: input.userId }, { onConflict: "id" });
  return { connectionId, site };
}

export async function connectPagerDuty(input: { tenantId: string; userId: string; connectionId?: string; apiToken: string; displayName?: string; environment?: string }) {
  const body = await requestJson("https://api.pagerduty.com/users?limit=1", { headers: { Accept: "application/vnd.pagerduty+json;version=2", Authorization: `Token token=${input.apiToken.trim()}` } });
  const user = body?.users?.[0];
  const db = await getAdminClient(); const connectionId = input.connectionId ?? crypto.randomUUID();
  await db.from("provider_connections").upsert({ id: connectionId, tenant_id: input.tenantId, provider: "pagerduty", external_id: user?.id ?? null, display_name: input.displayName?.trim() || user?.name || "PagerDuty", environment: input.environment ?? "Production", status: "connected", encrypted_credentials: encryptCredentials({ apiToken: input.apiToken.trim() }), last_error: null, connected_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_by: input.userId }, { onConflict: "id" });
  return { connectionId, displayName: user?.name || "PagerDuty" };
}
