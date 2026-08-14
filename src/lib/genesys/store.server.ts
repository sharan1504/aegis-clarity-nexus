// Server-only persistence + orchestration for the Genesys integration.
// Credentials live in public.integration_credentials, which has no Data API
// grants at all — only this server code (service role) can read or write them.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  DEFAULT_GENESYS_REGION,
  GENESYS_SCOPES,
  IntegrationError,
  toErrorCode,
  toErrorMessage,
} from "./errors";
import * as genesys from "./connector.server";

export const PROVIDER = "genesys";

type UserClient = SupabaseClient<Database>;

export interface TenantContext {
  tenantId: string;
  roles: string[];
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Resolves the caller's workspace and roles through their own RLS-scoped session. */
export async function resolveTenant(
  supabase: UserClient,
  userId: string,
): Promise<TenantContext> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();

  const tenantId = profile?.tenant_id;
  if (!tenantId) throw new IntegrationError("no_tenant");

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);

  return { tenantId, roles: (roleRows ?? []).map((r) => String(r.role)) };
}

/** Integration lifecycle changes require admin or manager, enforced server-side. */
export async function requireManage(
  supabase: UserClient,
  userId: string,
): Promise<TenantContext> {
  const ctx = await resolveTenant(supabase, userId);
  if (!ctx.roles.includes("admin") && !ctx.roles.includes("manager")) {
    throw new IntegrationError("forbidden");
  }
  return ctx;
}

export async function writeIntegrationAudit(
  supabase: UserClient,
  input: {
    tenantId: string;
    action: string;
    entityId?: string | null;
    detail?: string;
    payload?: Record<string, unknown>;
  },
) {
  // actor_id / actor_email / actor_role are forced by the database trigger from
  // the verified session — never supplied here.
  const { error } = await supabase.from("audit_log").insert({
    tenant_id: input.tenantId,
    action: input.action,
    entity_type: "integration",
    entity_id: input.entityId ?? null,
    detail: input.detail ?? null,
    payload: (input.payload ?? {}) as never,
  });
  if (error) console.error("[genesys] audit write failed", error.message);
}

export interface IntegrationSummary {
  id: string | null;
  provider: string;
  status: string;
  healthStatus: string;
  healthDetail: string | null;
  region: string | null;
  externalOrgId: string | null;
  externalOrgName: string | null;
  scopes: string[];
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  connectedAt: string | null;
  counts?: { users: number; licenses: number; userLicenses: number; queues: number };
}

/** Reads integration state through the caller's session (RLS-scoped). */
export async function getIntegrationSummary(
  supabase: UserClient,
  tenantId: string,
): Promise<IntegrationSummary | null> {
  const { data } = await supabase
    .from("integrations")
    .select(
      "id, provider, status, health_status, health_detail, region, external_org_id, external_org_name, scopes, last_sync_at, last_sync_status, last_sync_error, connected_at",
    )
    .eq("tenant_id", tenantId)
    .eq("provider", PROVIDER)
    .maybeSingle();

  if (!data) return null;

  const [users, licenses, userLicenses, queues] = await Promise.all([
    supabase
      .from("genesys_users")
      .select("id", { count: "exact", head: true })
      .eq("integration_id", data.id),
    supabase
      .from("genesys_licenses")
      .select("id", { count: "exact", head: true })
      .eq("integration_id", data.id),
    supabase
      .from("genesys_user_licenses")
      .select("id", { count: "exact", head: true })
      .eq("integration_id", data.id),
    supabase
      .from("genesys_queues")
      .select("id", { count: "exact", head: true })
      .eq("integration_id", data.id),
  ]);

  return {
    id: data.id,
    provider: data.provider,
    status: data.status,
    healthStatus: data.health_status,
    healthDetail: data.health_detail,
    region: data.region,
    externalOrgId: data.external_org_id,
    externalOrgName: data.external_org_name,
    scopes: data.scopes ?? [],
    lastSyncAt: data.last_sync_at,
    lastSyncStatus: data.last_sync_status,
    lastSyncError: data.last_sync_error,
    connectedAt: data.connected_at,
    counts: {
      users: users.count ?? 0,
      licenses: licenses.count ?? 0,
      userLicenses: userLicenses.count ?? 0,
      queues: queues.count ?? 0,
    },
  };
}

/** Creates (or returns) the tenant's Genesys integration row. */
export async function ensureIntegration(
  tenantId: string,
  region: string,
  userId: string,
): Promise<string> {
  const db = await admin();
  const { data, error } = await db
    .from("integrations")
    .upsert(
      {
        tenant_id: tenantId,
        provider: PROVIDER,
        status: "authorizing",
        health_status: "unknown",
        region,
        scopes: [...GENESYS_SCOPES],
        connected_by: userId,
      },
      { onConflict: "tenant_id,provider" },
    )
    .select("id")
    .single();

  if (error || !data) throw new IntegrationError("provider_error", error?.message);
  return data.id;
}

export async function createOAuthState(input: {
  tenantId: string;
  region: string;
  redirectUri: string;
  userId: string;
}): Promise<string> {
  const db = await admin();
  const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const { error } = await db.from("integration_oauth_states").insert({
    state,
    tenant_id: input.tenantId,
    provider: PROVIDER,
    region: input.region,
    redirect_uri: input.redirectUri,
    created_by: input.userId,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) throw new IntegrationError("provider_error", error.message);
  return state;
}

export async function consumeOAuthState(
  state: string,
  tenantId: string,
): Promise<{ region: string; redirectUri: string }> {
  const db = await admin();
  const { data } = await db
    .from("integration_oauth_states")
    .select("state, tenant_id, region, redirect_uri, expires_at, consumed_at")
    .eq("state", state)
    .maybeSingle();

  if (
    !data ||
    data.tenant_id !== tenantId ||
    data.consumed_at ||
    new Date(data.expires_at).getTime() < Date.now()
  ) {
    throw new IntegrationError("oauth_state_invalid");
  }

  await db
    .from("integration_oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("state", state);

  return { region: data.region ?? DEFAULT_GENESYS_REGION, redirectUri: data.redirect_uri };
}

export async function saveTokens(
  integrationId: string,
  tenantId: string,
  tokens: genesys.GenesysTokens,
) {
  const db = await admin();
  const { error } = await db.from("integration_credentials").upsert(
    {
      integration_id: integrationId,
      tenant_id: tenantId,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_type: tokens.tokenType,
      expires_at: tokens.expiresAt,
      scopes: tokens.scopes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "integration_id" },
  );
  if (error) throw new IntegrationError("provider_error", error.message);
}

/**
 * Returns a usable access token, refreshing it first when it is within two
 * minutes of expiry. Tokens never leave the server.
 */
export async function getAccessToken(
  integrationId: string,
  tenantId: string,
  region: string | null,
): Promise<string> {
  const db = await admin();
  const { data } = await db
    .from("integration_credentials")
    .select("access_token, refresh_token, expires_at")
    .eq("integration_id", integrationId)
    .maybeSingle();

  if (!data?.access_token) throw new IntegrationError("not_connected");

  const expiresSoon =
    !data.expires_at || new Date(data.expires_at).getTime() - Date.now() < 120_000;

  if (!expiresSoon) return data.access_token;
  if (!data.refresh_token) throw new IntegrationError("token_expired");

  const refreshed = await genesys.refreshAccessToken({
    refreshToken: data.refresh_token,
    regionId: region,
  });
  await saveTokens(integrationId, tenantId, {
    ...refreshed,
    refreshToken: refreshed.refreshToken ?? data.refresh_token,
  });
  return refreshed.accessToken;
}

export async function markIntegration(
  integrationId: string,
  patch: Record<string, unknown>,
) {
  const db = await admin();
  await db
    .from("integrations")
    .update(patch as never)
    .eq("id", integrationId);
}

export interface SyncResult {
  status: "success" | "failed";
  startedAt: string;
  finishedAt: string;
  counts: { users: number; licenses: number; queues: number };
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Manual read-only sync: pulls users, licenses and queues from Genesys and
 * upserts them into Postgres, recording a sync run row either way.
 */
export async function runSync(
  supabase: UserClient,
  userId: string,
  tenantId: string,
  integrationId: string,
  region: string | null,
): Promise<SyncResult> {
  const db = await admin();
  const startedAt = new Date().toISOString();

  const { data: run } = await db
    .from("integration_sync_runs")
    .insert({
      tenant_id: tenantId,
      integration_id: integrationId,
      trigger: "manual",
      status: "running",
      started_at: startedAt,
      created_by: userId,
    })
    .select("id")
    .single();

  await writeIntegrationAudit(supabase, {
    tenantId,
    action: "integration.sync_started",
    entityId: integrationId,
    detail: "Manual Genesys read-only sync started.",
    payload: { provider: PROVIDER, runId: run?.id ?? null },
  });

  const counts = { users: 0, licenses: 0, queues: 0 };

  try {
    const token = await getAccessToken(integrationId, tenantId, region);
    const org = await genesys.getOrganization(token, region);

    const [users, licenses, queues] = await Promise.all([
      genesys.listUsers(token, region),
      genesys.listLicenses(token, region),
      genesys.listQueues(token, region),
    ]);

    const syncedAt = new Date().toISOString();

    if (users.length) {
      const { error } = await db.from("genesys_users").upsert(
        users.map((u) => ({
          tenant_id: tenantId,
          integration_id: integrationId,
          genesys_user_id: u.id,
          name: u.name,
          email: u.email,
          title: u.title,
          department: u.department,
          state: u.state,
          presence: u.presence,
          license_name: u.licenseName,
          division_name: u.divisionName,
          last_login_at: u.lastLoginAt,
          date_created: u.dateCreated,
          raw: u.raw as never,
          synced_at: syncedAt,
        })) as never,
        { onConflict: "integration_id,genesys_user_id" },
      );
      if (error) throw new IntegrationError("provider_error", error.message);
      counts.users = users.length;
    }

    if (licenses.length) {
      const { error } = await db.from("genesys_licenses").upsert(
        licenses.map((l) => ({
          tenant_id: tenantId,
          integration_id: integrationId,
          license_id: l.id,
          name: l.name,
          permissions: l.permissions,
          assigned_count: l.assignedCount,
          raw: l.raw as never,
          synced_at: syncedAt,
        })) as never,
        { onConflict: "integration_id,license_id" },
      );
      if (error) throw new IntegrationError("provider_error", error.message);
      counts.licenses = licenses.length;
    }

    if (queues.length) {
      const { error } = await db.from("genesys_queues").upsert(
        queues.map((q) => ({
          tenant_id: tenantId,
          integration_id: integrationId,
          queue_id: q.id,
          name: q.name,
          description: q.description,
          division_name: q.divisionName,
          member_count: q.memberCount,
          media_settings: q.mediaSettings as never,
          date_created: q.dateCreated,
          raw: q.raw as never,
          synced_at: syncedAt,
        })) as never,
        { onConflict: "integration_id,queue_id" },
      );
      if (error) throw new IntegrationError("provider_error", error.message);
      counts.queues = queues.length;
    }

    const finishedAt = new Date().toISOString();

    if (run?.id) {
      await db
        .from("integration_sync_runs")
        .update({ status: "success", finished_at: finishedAt, stats: counts as never })
        .eq("id", run.id);
    }

    await markIntegration(integrationId, {
      status: "connected",
      health_status: "healthy",
      health_detail: null,
      external_org_id: org.id,
      external_org_name: org.name,
      last_sync_at: finishedAt,
      last_sync_status: "success",
      last_sync_error: null,
    });

    await writeIntegrationAudit(supabase, {
      tenantId,
      action: "integration.sync_completed",
      entityId: integrationId,
      detail: `Genesys sync completed: ${counts.users} users, ${counts.licenses} licenses, ${counts.queues} queues.`,
      payload: { provider: PROVIDER, runId: run?.id ?? null, ...counts },
    });

    return { status: "success", startedAt, finishedAt, counts };
  } catch (error) {
    const code = toErrorCode(error);
    const message = toErrorMessage(error);
    const finishedAt = new Date().toISOString();
    console.error("[genesys] sync failed", code, error);

    if (run?.id) {
      await db
        .from("integration_sync_runs")
        .update({
          status: "failed",
          finished_at: finishedAt,
          error_code: code,
          error_message: message,
          stats: counts as never,
        })
        .eq("id", run.id);
    }

    await markIntegration(integrationId, {
      health_status: code === "rate_limited" ? "degraded" : "unhealthy",
      health_detail: message,
      status:
        code === "connection_revoked" || code === "token_expired" ? "action_required" : undefined,
      last_sync_status: "failed",
      last_sync_error: message,
    });

    await writeIntegrationAudit(supabase, {
      tenantId,
      action: "integration.sync_failed",
      entityId: integrationId,
      detail: message,
      payload: { provider: PROVIDER, runId: run?.id ?? null, errorCode: code },
    });

    return { status: "failed", startedAt, finishedAt, counts, errorCode: code, errorMessage: message };
  }
}

export async function disconnect(
  supabase: UserClient,
  tenantId: string,
  integrationId: string,
) {
  const db = await admin();
  await db.from("integration_credentials").delete().eq("integration_id", integrationId);
  await markIntegration(integrationId, {
    status: "disconnected",
    health_status: "unknown",
    health_detail: null,
    connected_at: null,
  });
  await writeIntegrationAudit(supabase, {
    tenantId,
    action: "integration.disconnected",
    entityId: integrationId,
    detail: "Genesys integration disconnected and stored tokens deleted.",
    payload: { provider: PROVIDER },
  });
}
