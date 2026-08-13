// Thin server-function wrappers for the Genesys integration.
// All logic lives in ./genesys/*.server.ts so no credential-bearing code can
// reach the client bundle.
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getGenesysIntegration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const store = await import("./genesys/store.server");
    const connector = await import("./genesys/connector.server");
    try {
      const { tenantId, roles } = await store.resolveTenant(context.supabase, context.userId);
      const integration = await store.getIntegrationSummary(context.supabase, tenantId);
      return {
        configured: connector.isConfigured(),
        canManage: roles.includes("admin") || roles.includes("manager"),
        integration,
      };
    } catch {
      return { configured: connector.isConfigured(), canManage: false, integration: null };
    }
  });

export const startGenesysOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { region: string; redirectUri: string }) => ({
    region: String(input.region ?? "").trim(),
    redirectUri: String(input.redirectUri ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    const store = await import("./genesys/store.server");
    const connector = await import("./genesys/connector.server");
    const errors = await import("./genesys/errors");
    try {
      const { tenantId } = await store.requireManage(context.supabase, context.userId);
      const region = data.region || errors.DEFAULT_GENESYS_REGION;
      const integrationId = await store.ensureIntegration(tenantId, region, context.userId);
      const state = await store.createOAuthState({
        tenantId,
        region,
        redirectUri: data.redirectUri,
        userId: context.userId,
      });
      await store.writeIntegrationAudit(context.supabase, {
        tenantId,
        action: "integration.oauth_started",
        entityId: integrationId,
        detail: `Genesys authorization started (${region}).`,
        payload: { provider: "genesys", region, scopes: errors.GENESYS_SCOPES },
      });
      return {
        ok: true as const,
        authorizeUrl: connector.buildAuthorizeUrl({
          redirectUri: data.redirectUri,
          state,
          regionId: region,
        }),
      };
    } catch (error) {
      return {
        ok: false as const,
        errorCode: errors.toErrorCode(error),
        errorMessage: errors.toErrorMessage(error),
      };
    }
  });

export const completeGenesysOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code?: string; state?: string; error?: string }) => ({
    code: input.code ? String(input.code) : "",
    state: input.state ? String(input.state) : "",
    error: input.error ? String(input.error) : "",
  }))
  .handler(async ({ data, context }) => {
    const store = await import("./genesys/store.server");
    const connector = await import("./genesys/connector.server");
    const errors = await import("./genesys/errors");
    try {
      const { tenantId } = await store.requireManage(context.supabase, context.userId);
      if (data.error || !data.code || !data.state) {
        throw new errors.IntegrationError("oauth_failed", data.error || "missing code/state");
      }

      const { region, redirectUri } = await store.consumeOAuthState(data.state, tenantId);
      const integrationId = await store.ensureIntegration(tenantId, region, context.userId);

      const tokens = await connector.exchangeAuthorizationCode({
        code: data.code,
        redirectUri,
        regionId: region,
      });
      await store.saveTokens(integrationId, tenantId, tokens);

      await store.writeIntegrationAudit(context.supabase, {
        tenantId,
        action: "integration.oauth_completed",
        entityId: integrationId,
        detail: "Genesys authorization code exchanged for read-only tokens.",
        payload: { provider: "genesys", region, scopes: tokens.scopes },
      });

      const { org, me } = await connector.healthCheck(tokens.accessToken, region);
      await store.markIntegration(integrationId, {
        status: "connected",
        health_status: "healthy",
        health_detail: null,
        region,
        external_org_id: org.id,
        external_org_name: org.name,
        scopes: tokens.scopes,
        connected_at: new Date().toISOString(),
        connected_by: context.userId,
      });

      await store.writeIntegrationAudit(context.supabase, {
        tenantId,
        action: "integration.connected",
        entityId: integrationId,
        detail: `Genesys Cloud connected to organization ${org.name} (${region}).`,
        payload: { provider: "genesys", orgId: org.id, orgName: org.name, authorizedBy: me.email },
      });

      return { ok: true as const, orgName: org.name, region };
    } catch (error) {
      return {
        ok: false as const,
        errorCode: errors.toErrorCode(error),
        errorMessage: errors.toErrorMessage(error),
      };
    }
  });

export const verifyGenesysConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const store = await import("./genesys/store.server");
    const connector = await import("./genesys/connector.server");
    const errors = await import("./genesys/errors");
    try {
      const { tenantId } = await store.requireManage(context.supabase, context.userId);
      const summary = await store.getIntegrationSummary(context.supabase, tenantId);
      if (!summary?.id) throw new errors.IntegrationError("not_connected");

      const token = await store.getAccessToken(summary.id, tenantId, summary.region);
      const { org } = await connector.healthCheck(token, summary.region);

      await store.markIntegration(summary.id, {
        status: "connected",
        health_status: "healthy",
        health_detail: null,
        external_org_id: org.id,
        external_org_name: org.name,
      });
      await store.writeIntegrationAudit(context.supabase, {
        tenantId,
        action: "integration.verified",
        entityId: summary.id,
        detail: `Genesys connection verified against organization ${org.name}.`,
        payload: { provider: "genesys", orgId: org.id },
      });

      return { ok: true as const, orgName: org.name, healthStatus: "healthy" };
    } catch (error) {
      return {
        ok: false as const,
        errorCode: errors.toErrorCode(error),
        errorMessage: errors.toErrorMessage(error),
      };
    }
  });

export const syncGenesysNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const store = await import("./genesys/store.server");
    const errors = await import("./genesys/errors");
    try {
      const { tenantId } = await store.requireManage(context.supabase, context.userId);
      const summary = await store.getIntegrationSummary(context.supabase, tenantId);
      if (!summary?.id) throw new errors.IntegrationError("not_connected");

      const result = await store.runSync(
        context.supabase,
        context.userId,
        tenantId,
        summary.id,
        summary.region,
      );
      return { ok: result.status === "success", ...result };
    } catch (error) {
      return {
        ok: false,
        status: "failed" as const,
        errorCode: errors.toErrorCode(error),
        errorMessage: errors.toErrorMessage(error),
      };
    }
  });

export const disconnectGenesys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const store = await import("./genesys/store.server");
    const errors = await import("./genesys/errors");
    try {
      const { tenantId } = await store.requireManage(context.supabase, context.userId);
      const summary = await store.getIntegrationSummary(context.supabase, tenantId);
      if (!summary?.id) throw new errors.IntegrationError("not_connected");
      await store.disconnect(context.supabase, tenantId, summary.id);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        errorCode: errors.toErrorCode(error),
        errorMessage: errors.toErrorMessage(error),
      };
    }
  });

export const getGenesysSyncHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const store = await import("./genesys/store.server");
    try {
      const { tenantId } = await store.resolveTenant(context.supabase, context.userId);
      const { data } = await context.supabase
        .from("integration_sync_runs")
        .select("id, status, started_at, finished_at, error_code, error_message, stats")
        .eq("tenant_id", tenantId)
        .order("started_at", { ascending: false })
        .limit(10);
      return { runs: data ?? [] };
    } catch {
      return { runs: [] };
    }
  });
