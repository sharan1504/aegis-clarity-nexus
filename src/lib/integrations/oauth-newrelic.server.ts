import crypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";
import { getAdminClient, storeOAuthConnection, markReconnectRequired } from "./oauth-framework.server";
import { encryptCredentials } from "./credential-vault.server";

export const NEW_RELIC_REGIONS = ["us", "eu", "jp"] as const;
export type NewRelicRegion = (typeof NEW_RELIC_REGIONS)[number];
const endpoint = (region: NewRelicRegion) => region === "eu" ? "https://api.eu.newrelic.com/graphql" : region === "jp" ? "https://api.jp.newrelic.com/graphql" : "https://api.newrelic.com/graphql";

export async function validateNewRelicUserKey(input: { apiKey: string; region: NewRelicRegion }) {
  const response = await fetch(endpoint(input.region), { method: "POST", headers: { "content-type": "application/json", "API-Key": input.apiKey }, body: JSON.stringify({ query: "{ actor { user { name email } } }" }) });
  const text = await response.text();
  if (!response.ok) throw new Error(`New Relic authentication failed (${response.status}): ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as any;
  if (json.errors?.length) throw new Error(`New Relic authentication failed: ${json.errors[0]?.message ?? "invalid user key"}`);
  return { displayName: json.data?.actor?.user?.name ?? json.data?.actor?.user?.email ?? "New Relic" };
}

export async function connectNewRelic(input: { tenantId: string; userId: string; connectionId?: string; apiKey: string; region: NewRelicRegion; displayName?: string; environment?: string }) {
  const validation = await validateNewRelicUserKey({ apiKey: input.apiKey.trim(), region: input.region });
  const db = await getAdminClient();
  const connectionId = input.connectionId ?? crypto.randomUUID();
  const displayName = input.displayName?.trim() || validation.displayName;
  await db.from("provider_connections").upsert({ id: connectionId, tenant_id: input.tenantId, provider: "newrelic", external_id: input.region, display_name: displayName, environment: input.environment ?? "Production", status: "connected", encrypted_credentials: encryptCredentials({ apiKey: input.apiKey.trim(), region: input.region }), last_error: null, connected_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_by: input.userId }, { onConflict: "id" });
  return { connectionId, displayName, region: input.region };
}

export const startNewRelicConnection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId?: string; apiKey: string; region: NewRelicRegion; displayName?: string; environment?: string }) => input).handler(async ({ data, context }) => { const { tenantId, roles } = await resolveTenant(context.supabase, context.userId); if (!roles.includes("admin") && !roles.includes("manager")) throw new Error("Admin/manager access is required to connect an integration."); return connectNewRelic({ tenantId, userId: context.userId, ...data }); });
