import crypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";
import { getAdminClient, storeOAuthConnection, markReconnectRequired } from "./oauth-framework.server";
import { encryptCredentials } from "./credential-vault.server";

export type VeeamCredentials = { baseUrl: string; username: string; password: string; accessToken?: string; refreshToken?: string; expiresAt?: string };

async function tokenRequest(input: VeeamCredentials, grantType: "password" | "refresh_token") {
  const body = new URLSearchParams({ grant_type: grantType });
  if (grantType === "password") { body.set("username", input.username); body.set("password", input.password); }
  else body.set("refresh_token", input.refreshToken ?? "");
  const response = await fetch(`${input.baseUrl.replace(/\/$/, "")}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body });
  const text = await response.text(); if (!response.ok) throw new Error(`Veeam Service Provider Console authentication failed (${response.status}): ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as any; if (!json.access_token) throw new Error("Veeam did not return an access token.");
  return { accessToken: json.access_token, refreshToken: json.refresh_token ?? input.refreshToken, expiresAt: new Date(Date.now() + Number(json.expires_in ?? 3600) * 1000).toISOString() };
}

export async function connectVeeam(input: { tenantId: string; userId: string; connectionId?: string; baseUrl: string; username: string; password: string; displayName?: string; environment?: string }) {
  const url = new URL(input.baseUrl.trim()); if (url.protocol !== "https:") throw new Error("Veeam API base URL must use HTTPS.");
  const tokens = await tokenRequest({ baseUrl: `${url.origin}${url.pathname.replace(/\/$/, "")}`, username: input.username.trim(), password: input.password }, "password");
  const db = await getAdminClient(); const connectionId = input.connectionId ?? crypto.randomUUID(); const displayName = input.displayName?.trim() || "Veeam Service Provider Console";
  await db.from("provider_connections").upsert({ id: connectionId, tenant_id: input.tenantId, provider: "veeam", external_id: url.origin, display_name: displayName, environment: input.environment ?? "Production", status: "connected", encrypted_credentials: encryptCredentials({ baseUrl: `${url.origin}${url.pathname.replace(/\/$/, "")}`, username: input.username.trim(), password: input.password, ...tokens }), credential_expires_at: tokens.expiresAt, last_error: null, connected_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_by: input.userId }, { onConflict: "id" });
  return { connectionId, displayName };
}

export async function ensureVeeamAccessToken(connectionId: string, tenantId: string) {
  const db = await getAdminClient(); const { readConnectionCredentials } = await import("./oauth-framework.server"); const credentials = await readConnectionCredentials<VeeamCredentials>(db, connectionId, tenantId);
  if (credentials.accessToken && credentials.expiresAt && new Date(credentials.expiresAt).getTime() - Date.now() > 120_000) return credentials.accessToken;
  if (!credentials.refreshToken) { await markReconnectRequired(db, connectionId, "Veeam access token expired and no refresh token is available."); throw new Error("Veeam reconnect required."); }
  try { const tokens = await tokenRequest(credentials, "refresh_token"); await storeOAuthConnection(db, { connectionId, tenantId, provider: "veeam", externalId: new URL(credentials.baseUrl).origin, displayName: "Veeam Service Provider Console", credentials: { ...credentials, ...tokens }, expiresAt: tokens.expiresAt }); return tokens.accessToken; }
  catch (error) { await markReconnectRequired(db, connectionId, "Veeam token refresh failed. Reconnect required."); throw error; }
}

export const startVeeamConnection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId?: string; baseUrl: string; username: string; password: string; displayName?: string; environment?: string }) => input).handler(async ({ data, context }) => { const { tenantId, roles } = await resolveTenant(context.supabase, context.userId); if (!roles.includes("admin") && !roles.includes("manager")) throw new Error("Admin/manager access is required to connect an integration."); return connectVeeam({ tenantId, userId: context.userId, ...data }); });
