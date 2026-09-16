import crypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";
import { getAdminClient } from "./oauth-framework.server";
import { encryptCredentials } from "./credential-vault.server";

export async function connectSplunk(input: { tenantId: string; userId: string; connectionId?: string; baseUrl: string; token: string; displayName?: string; environment?: string }) {
  const url = new URL(input.baseUrl.trim());
  if (url.protocol !== "https:") throw new Error("Splunk base URL must use HTTPS.");
  const token = input.token.trim();
  if (!token) throw new Error("Splunk authentication token is required.");
  const baseUrl = `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  const response = await fetch(`${baseUrl}/services/authentication/current-context?output_mode=json`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Splunk authentication failed (${response.status}): ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as any;
  const displayName = input.displayName?.trim() || json.realname || json.username || "Splunk";
  const db = await getAdminClient();
  const connectionId = input.connectionId ?? crypto.randomUUID();
  const { error } = await db.from("provider_connections").upsert({ id: connectionId, tenant_id: input.tenantId, provider: "splunk", external_id: url.origin, display_name: displayName, environment: input.environment ?? "Production", status: "connected", encrypted_credentials: encryptCredentials({ baseUrl, token }), last_error: null, connected_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_by: input.userId }, { onConflict: "id" });
  if (error) throw new Error(`Unable to store Splunk connection: ${error.message}`);
  return { connectionId, displayName };
}

export const startSplunkConnection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId?: string; baseUrl: string; token: string; displayName?: string; environment?: string }) => input).handler(async ({ data, context }) => { const { tenantId, roles } = await resolveTenant(context.supabase, context.userId); if (!roles.includes("admin") && !roles.includes("manager")) throw new Error("Admin/manager access is required to connect an integration."); return connectSplunk({ tenantId, userId: context.userId, ...data }); });
