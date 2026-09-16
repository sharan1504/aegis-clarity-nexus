// Server-only persistence + orchestration for the Genesys integration.
// Credentials are stored only in provider_connections using application-layer AES-256-GCM.
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { GENESYS_SCOPES, IntegrationError, normalizeGenesysRegion, toErrorCode, toErrorMessage } from "./errors";
import * as genesys from "./connector.server";
import { resolveTenantContext, TenantResolutionError } from "../tenant-context.server";
import { encryptCredentials, decryptCredentials } from "../integrations/credential-vault.server";

export const PROVIDER = "genesys";

type UserClient = SupabaseClient<Database>;

export interface TenantContext { tenantId: string; roles: string[]; }

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function resolveTenant(supabase: UserClient, userId: string): Promise<TenantContext> {
  try { const ctx = await resolveTenantContext(supabase, userId); return { tenantId: ctx.tenantId, roles: ctx.roles }; }
  catch (error) { if (error instanceof TenantResolutionError) throw new IntegrationError("no_tenant"); throw error; }
}

export async function requireManage(supabase: UserClient, userId: string): Promise<TenantContext> {
  const ctx = await resolveTenant(supabase, userId);
  if (!ctx.roles.includes("admin") && !ctx.roles.includes("manager")) throw new IntegrationError("forbidden");
  return ctx;
}

export async function writeIntegrationAudit(supabase: UserClient, input: { tenantId: string; action: string; entityId?: string | null; detail?: string; payload?: Record<string, unknown>; }) {
  const { error } = await supabase.from("audit_log").insert({ tenant_id: input.tenantId, action: input.action, entity_type: "integration", entity_id: input.entityId ?? null, detail: input.detail ?? null, payload: (input.payload ?? {}) as never });
  if (error) console.error("[genesys] audit write failed", error.message);
}

export interface IntegrationSummary { id: string | null; provider: string; status: string; healthStatus: string; healthDetail: string | null; region: string | null; externalOrgId: string | null; externalOrgName: string | null; scopes: string[]; lastSyncAt: string | null; lastSyncStatus: string | null; lastSyncError: string | null; connectedAt: string | null; counts?: { users: number; licenses: number; userLicenses: number; queues: number }; }

export async function getIntegrationSummary(supabase: UserClient, tenantId: string): Promise<IntegrationSummary | null> {
  const { data } = await supabase.from("integrations").select("id, provider, status, health_status, health_detail, region, external_org_id, external_org_name, scopes, last_sync_at, last_sync_status, last_sync_error, connected_at").eq("tenant_id", tenantId).eq("provider", PROVIDER).maybeSingle();
  if (!data) return null;
  const [users, licenses, userLicenses, queues] = await Promise.all([
    supabase.from("genesys_users").select("id", { count: "exact", head: true }).eq("integration_id", data.id),
    supabase.from("genesys_licenses").select("id", { count: "exact", head: true }).eq("integration_id", data.id),
    supabase.from("genesys_user_licenses").select("id", { count: "exact", head: true }).eq("integration_id", data.id),
    supabase.from("genesys_queues").select("id", { count: "exact", head: true }).eq("integration_id", data.id),
  ]);
  return { id: data.id, provider: data.provider, status: data.status, healthStatus: data.health_status, healthDetail: data.health_detail, region: data.region, externalOrgId: data.external_org_id, externalOrgName: data.external_org_name, scopes: data.scopes ?? [], lastSyncAt: data.last_sync_at, lastSyncStatus: data.last_sync_status, lastSyncError: data.last_sync_error, connectedAt: data.connected_at, counts: { users: users.count ?? 0, licenses: licenses.count ?? 0, userLicenses: userLicenses.count ?? 0, queues: queues.count ?? 0 } };
}

export async function ensureIntegration(tenantId: string, region: string, userId: string): Promise<string> {
  const db = await admin();
  const { data, error } = await db.from("integrations").upsert({ tenant_id: tenantId, provider: PROVIDER, status: "authorizing", health_status: "unknown", region: normalizeGenesysRegion(region), scopes: [...GENESYS_SCOPES], connected_by: userId }, { onConflict: "tenant_id,provider" }).select("id").single();
  if (error || !data) throw new IntegrationError("provider_error", error?.message);
  return data.id;
}

export async function createOAuthState(input: { tenantId: string; region: string; redirectUri: string; userId: string; }): Promise<string> {
  const db = await admin(); const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const { error } = await db.from("integration_oauth_states").insert({ state, tenant_id: input.tenantId, provider: PROVIDER, region: normalizeGenesysRegion(input.region), redirect_uri: input.redirectUri, created_by: input.userId, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
  if (error) throw new IntegrationError("provider_error", error.message); return state;
}

export async function consumeOAuthState(state: string, tenantId: string): Promise<{ region: string; redirectUri: string }> {
  const db = await admin(); const { data } = await db.from("integration_oauth_states").select("state, tenant_id, region, redirect_uri, expires_at, consumed_at").eq("state", state).maybeSingle();
  if (!data || data.tenant_id !== tenantId || data.consumed_at || new Date(data.expires_at).getTime() < Date.now()) throw new IntegrationError("oauth_state_invalid");
  const { data: consumedState, error } = await db.from("integration_oauth_states").update({ consumed_at: new Date().toISOString() }).eq("state", state).eq("tenant_id", tenantId).is("consumed_at", null).select("state").maybeSingle();
  if (error || !consumedState) throw new IntegrationError("oauth_state_invalid");
  return { region: normalizeGenesysRegion(data.region), redirectUri: data.redirect_uri };
}

async function connectionRow(integrationId: string, tenantId: string) {
  const db = await admin(); const { data, error } = await (db.from("provider_connections" as any) as any).select("id,encrypted_credentials").eq("integration_id", integrationId).eq("tenant_id", tenantId).eq("provider", PROVIDER).maybeSingle();
  if (error) throw new IntegrationError("provider_error", error.message); if (!data) throw new IntegrationError("not_connected"); return data as { id: string; encrypted_credentials: string | null };
}

export async function saveClientCredentials(integrationId: string, tenantId: string, credentials: { clientId: string; clientSecret: string }) {
  const db = await admin(); const encrypted = encryptCredentials({ provider: PROVIDER, ...credentials }); const row = await connectionRow(integrationId, tenantId).catch(() => null);
  const payload = { tenant_id: tenantId, provider: PROVIDER, integration_id: integrationId, display_name: "Genesys Cloud", status: "failed", encrypted_credentials: encrypted, updated_at: new Date().toISOString() };
  const query = db.from("provider_connections" as any) as any; const result = row ? await query.update(payload).eq("id", row.id).eq("tenant_id", tenantId) : await query.insert(payload);
  if (result.error) throw new IntegrationError("provider_error", result.error.message);
}

export async function getStoredCredentials(integrationId: string, tenantId: string) {
  const row = await connectionRow(integrationId, tenantId); if (!row.encrypted_credentials) throw new IntegrationError("not_configured", "The encrypted OAuth client configuration is missing. Reconnect the integration.");
  return decryptCredentials<{ provider: string; clientId: string; clientSecret: string; accessToken?: string; refreshToken?: string; tokenType?: string; expiresAt?: string; scopes?: string[] }>(row.encrypted_credentials);
}

export async function saveTokens(integrationId: string, tenantId: string, tokens: genesys.GenesysTokens) {
  const db = await admin(); const current = await getStoredCredentials(integrationId, tenantId); const encrypted = encryptCredentials({ ...current, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, tokenType: tokens.tokenType, expiresAt: tokens.expiresAt, scopes: tokens.scopes }); const row = await connectionRow(integrationId, tenantId);
  const { error } = await (db.from("provider_connections" as any) as any).update({ encrypted_credentials: encrypted, credential_expires_at: tokens.expiresAt, status: "connected", last_error: null, connected_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", row.id).eq("tenant_id", tenantId);
  if (error) throw new IntegrationError("provider_error", error.message);
}

export async function getAccessToken(integrationId: string, tenantId: string, region: string | null): Promise<string> {
  const credentials = await getStoredCredentials(integrationId, tenantId); if (!credentials.accessToken) throw new IntegrationError("not_connected");
  const expiresSoon = !credentials.expiresAt || new Date(credentials.expiresAt).getTime() - Date.now() < 120_000;
  if (!expiresSoon) return credentials.accessToken;
  if (!credentials.refreshToken) { await markIntegration(integrationId, { status: "action_required", health_status: "unhealthy", health_detail: "Genesys access token expired and no refresh token is available. Reconnect required." }); throw new IntegrationError("token_expired"); }
  try { const refreshed = await genesys.refreshAccessToken({ refreshToken: credentials.refreshToken, regionId: region }); await saveTokens(integrationId, tenantId, { ...refreshed, refreshToken: refreshed.refreshToken ?? credentials.refreshToken }); return refreshed.accessToken; }
  catch (error) { await markIntegration(integrationId, { status: "action_required", health_status: "unhealthy", health_detail: "Genesys token refresh failed. Reconnect required." }); throw error; }
}

export async function markIntegration(integrationId: string, patch: Record<string, unknown>) { const db = await admin(); await db.from("integrations").update(patch as never).eq("id", integrationId); }

export interface SyncResult { status: "success" | "failed"; startedAt: string; finishedAt: string; counts: { users: number; licenses: number; userLicenses: number; queues: number }; errorCode?: string; errorMessage?: string; }

export async function runSync(supabase: UserClient, userId: string, tenantId: string, integrationId: string, region: string | null): Promise<SyncResult> {
  const db = await admin(); const startedAt = new Date().toISOString(); const { data: run } = await db.from("integration_sync_runs").insert({ tenant_id: tenantId, integration_id: integrationId, trigger: "manual", status: "running", started_at: startedAt, created_by: userId }).select("id").single();
  await writeIntegrationAudit(supabase, { tenantId, action: "integration.sync_started", entityId: integrationId, detail: "Manual Genesys read-only sync started.", payload: { provider: PROVIDER, runId: run?.id ?? null } });
  const counts = { users: 0, licenses: 0, userLicenses: 0, queues: 0 };
  try {
    const token = await getAccessToken(integrationId, tenantId, region); const org = await genesys.getOrganization(token, region); const users = await genesys.listUsers(token, region); const assignments = await genesys.listUserLicenseAssignments(token, region); const queues = await genesys.listQueues(token, region); const licenses = await genesys.listLicenses(token, region, assignments); const syncedAt = new Date().toISOString();
    if (users.length) { const { error } = await db.from("genesys_users").upsert(users.map((u) => ({ tenant_id: tenantId, integration_id: integrationId, genesys_user_id: u.id, name: u.name, email: u.email, title: u.title, department: u.department, state: u.state, presence: u.presence, license_name: u.licenseName, division_name: u.divisionName, last_login_at: u.lastLoginAt, date_created: u.dateCreated, raw: u.raw as never, synced_at: syncedAt })) as never, { onConflict: "integration_id,genesys_user_id" }); if (error) throw new IntegrationError("provider_error", error.message); counts.users = users.length; }
    if (licenses.length) { const { error } = await db.from("genesys_licenses").upsert(licenses.map((l) => ({ tenant_id: tenantId, integration_id: integrationId, license_id: l.id, name: l.name, permissions: l.permissions, assigned_count: l.assignedCount, raw: l.raw as never, synced_at: syncedAt })) as never, { onConflict: "integration_id,license_id" }); if (error) throw new IntegrationError("provider_error", error.message); counts.licenses = licenses.length; }
    const assignmentRows = assignments.flatMap((a) => a.licenseIds.map((licenseId) => ({ tenant_id: tenantId, integration_id: integrationId, genesys_user_id: a.genesysUserId, license_id: licenseId, synced_at: syncedAt, updated_at: syncedAt })));
    for (let i = 0; i < assignmentRows.length; i += 500) { const { error } = await db.from("genesys_user_licenses").upsert(assignmentRows.slice(i, i + 500) as never, { onConflict: "integration_id,genesys_user_id,license_id" }); if (error) throw new IntegrationError("provider_error", error.message); }
    counts.userLicenses = assignmentRows.length; { const { error } = await db.from("genesys_user_licenses").delete().eq("integration_id", integrationId).lt("synced_at", syncedAt); if (error) throw new IntegrationError("provider_error", error.message); }
    if (queues.length) { const { error } = await db.from("genesys_queues").upsert(queues.map((q) => ({ tenant_id: tenantId, integration_id: integrationId, queue_id: q.id, name: q.name, description: q.description, division_name: q.divisionName, member_count: q.memberCount, media_settings: q.mediaSettings as never, date_created: q.dateCreated, raw: q.raw as never, synced_at: syncedAt })) as never, { onConflict: "integration_id,queue_id" }); if (error) throw new IntegrationError("provider_error", error.message); counts.queues = queues.length; }
    const finishedAt = new Date().toISOString(); if (run?.id) await db.from("integration_sync_runs").update({ status: "success", finished_at: finishedAt, stats: counts as never }).eq("id", run.id);
    await markIntegration(integrationId, { status: "connected", health_status: "healthy", health_detail: null, external_org_id: org.id, external_org_name: org.name, last_sync_at: finishedAt, last_sync_status: "success", last_sync_error: null });
    await writeIntegrationAudit(supabase, { tenantId, action: "integration.sync_completed", entityId: integrationId, detail: `Genesys sync completed: ${counts.users} users, ${counts.licenses} license types, ${counts.userLicenses} user-license assignments, ${counts.queues} queues.`, payload: { provider: PROVIDER, runId: run?.id ?? null, ...counts } });
    return { status: "success", startedAt, finishedAt, counts };
  } catch (error) {
    const code = toErrorCode(error); const message = toErrorMessage(error); const finishedAt = new Date().toISOString(); if (run?.id) await db.from("integration_sync_runs").update({ status: "failed", finished_at: finishedAt, error_code: code, error_message: message, stats: counts as never }).eq("id", run.id);
    await markIntegration(integrationId, { health_status: code === "rate_limited" ? "degraded" : "unhealthy", health_detail: message, status: code === "connection_revoked" || code === "token_expired" ? "action_required" : undefined, last_sync_status: "failed", last_sync_error: message });
    await writeIntegrationAudit(supabase, { tenantId, action: "integration.sync_failed", entityId: integrationId, detail: message, payload: { provider: PROVIDER, runId: run?.id ?? null, errorCode: code } });
    return { status: "failed", startedAt, finishedAt, counts, errorCode: code, errorMessage: message };
  }
}

export async function disconnect(supabase: UserClient, tenantId: string, integrationId: string) {
  const db = await admin(); const row = await connectionRow(integrationId, tenantId).catch(() => null); if (row) await (db.from("provider_connections" as any) as any).delete().eq("id", row.id).eq("tenant_id", tenantId);
  await markIntegration(integrationId, { status: "disconnected", health_status: "unknown", health_detail: null, connected_at: null });
  await writeIntegrationAudit(supabase, { tenantId, action: "integration.disconnected", entityId: integrationId, detail: "Genesys integration disconnected and encrypted credentials deleted.", payload: { provider: PROVIDER } });
}
