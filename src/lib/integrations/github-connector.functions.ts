import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getGitHubSyncStatus, healthCheckGitHub, syncGitHub, authorizeGitHubSync, type GitHubEntityScope } from "./github-connector.server";

export const getGitHubSyncStatusFn = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId: string }) => ({ connectionId: String(input.connectionId) })).handler(async ({ data, context }) => {
  const tenantId = await authorizeGitHubSync(context.supabase, context.userId, data.connectionId);
  return getGitHubSyncStatus(tenantId, data.connectionId);
});

export const healthCheckGitHubFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId: string }) => ({ connectionId: String(input.connectionId) })).handler(async ({ data, context }) => {
  const tenantId = await authorizeGitHubSync(context.supabase, context.userId, data.connectionId);
  return healthCheckGitHub(tenantId, data.connectionId);
});

export const syncGitHubFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId: string; entityScope?: GitHubEntityScope }) => ({ connectionId: String(input.connectionId), entityScope: input.entityScope ?? "all" })).handler(async ({ data, context }) => {
  const tenantId = await authorizeGitHubSync(context.supabase, context.userId, data.connectionId);
  const idempotencyKey = `github-manual:${tenantId}:${data.connectionId}:${Date.now()}`;
  const { data: run, error } = await context.supabase.from("provider_sync_runs").insert({ tenant_id: tenantId, provider: "github", connection_id: data.connectionId, idempotency_key: idempotencyKey, status: "running", started_at: new Date().toISOString() }).select("id").single();
  if (error) throw error;
  return syncGitHub(tenantId, data.connectionId, data.entityScope, run.id, idempotencyKey);
});
