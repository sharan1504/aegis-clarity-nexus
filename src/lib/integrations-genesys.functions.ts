// Thin server-function wrappers for the Genesys integration.
// All credential-bearing logic stays server-side.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getGenesysIntegration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const store = await import("./genesys/store.server");
    const connector = await import("./genesys/connector.server");
    const summary = await import("./genesys/summary.server");
    try {
      const { tenantId, roles } = await store.resolveTenant(context.supabase, context.userId);
      const integration = await store.getIntegrationSummary(context.supabase, tenantId);
      const serverAuthorizedIntegration = await summary.getGenesysIntegrationSummary(tenantId, integration);
      return { configured: connector.isConfigured(), canManage: roles.includes("admin") || roles.includes("manager"), integration: serverAuthorizedIntegration };
    } catch {
      return { configured: connector.isConfigured(), canManage: false, integration: null };
    }
  });

export const startGenesysOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { region: string; redirectUri: string; clientId?: string; clientSecret?: string; displayName?: string; environment?: string }) => ({
    region: String(input.region ?? "").trim(),
    redirectUri: String(input.redirectUri ?? "").trim(),
    clientId: String(input.clientId ?? "").trim(),
    clientSecret: String(input.clientSecret ?? "").trim(),
    displayName: String(input.displayName ?? "").trim(),
    environment: String(input.environment ?? "Production").trim() || "Production",
  }))
  .handler(async ({ data, context }) => {
    const store = await import("./genesys/store.server");
    const connector = await import("./genesys/connector.server");
    const instanceOAuth = await import("./genesys/instance-oauth.server");
    const errors = await import("./genesys/errors");
    try {
      const { tenantId } = await store.requireManage(context.supabase, context.userId);
      if (!errors.isSupportedGenesysRegion(data.region)) throw new errors.IntegrationError("provider_error", "unsupported region");
      if (!data.clientId || !data.clientSecret) {
        // Backward-compatible path for the original single configured client.
        if (!connector.isConfigured()) throw new errors.IntegrationError("not_configured", "Enter the Genesys OAuth client ID and client secret for this integration.");
      }
      const region = errors.normalizeGenesysRegion(data.region);
      const credentials = data.clientId && data.clientSecret ? { clientId: data.clientId, clientSecret: data.clientSecret } : connector.getClientCredentials();
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("integrations")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("provider", "genesys")
        .eq("status", "authorizing")
        .limit(1)
        .maybeSingle();
      if (existingError) throw new errors.IntegrationError("provider_error", existingError.message);
      const integrationId = existing?.id ?? crypto.randomUUID();
      const { error: integrationError } = await supabaseAdmin.from("integrations").upsert({
        id: integrationId,
        tenant_id: tenantId,
        provider: "genesys",
        status: "authorizing",
        health_status: "unknown",
        region,
        display_name: data.displayName || "Genesys Cloud",
        scopes: [...errors.GENESYS_SCOPES],
        connected_by: context.userId,
        is_mock: false,
      }, { onConflict: "id" });
      if (integrationError) throw new errors.IntegrationError("provider_error", integrationError.message);

      const { error: credentialError } = await supabaseAdmin.from("integration_credentials").upsert({
        integration_id: integrationId,
        tenant_id: tenantId,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        updated_at: new Date().toISOString(),
      }, { onConflict: "integration_id" });
      if (credentialError) throw new errors.IntegrationError("provider_error", credentialError.message);

      const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const { error: stateError } = await supabaseAdmin.from("integration_oauth_states").insert({
        state,
        tenant_id: tenantId,
        provider: "genesys",
        integration_id: integrationId,
        region,
        redirect_uri: data.redirectUri,
        created_by: context.userId,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      if (stateError) throw new errors.IntegrationError("provider_error", stateError.message);

      await store.writeIntegrationAudit(context.supabase, { tenantId, action: "integration.oauth_started", entityId: integrationId, detail: `Genesys authorization started (${region}) for a new integration instance.`, payload: { provider: "genesys", region, scopes: errors.GENESYS_SCOPES } });
      return { ok: true as const, authorizeUrl: instanceOAuth.buildAuthorizeUrl({ clientId: credentials.clientId, redirectUri: data.redirectUri, state, region }), integrationId };
    } catch (error) { return { ok: false as const, errorCode: errors.toErrorCode(error), errorMessage: errors.toErrorMessage(error) }; }
  });

export const completeGenesysOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code?: string; state?: string; error?: string }) => ({ code: input.code ? String(input.code) : "", state: input.state ? String(input.state) : "", error: input.error ? String(input.error) : "" }))
  .handler(async ({ data, context }) => {
    const store = await import("./genesys/store.server");
    const instanceOAuth = await import("./genesys/instance-oauth.server");
    const errors = await import("./genesys/errors");
    try {
      const { tenantId } = await store.requireManage(context.supabase, context.userId);
      if (data.error || !data.code || !data.state) throw new errors.IntegrationError("oauth_failed", data.error || "missing code/state");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: oauthState } = await supabaseAdmin.from("integration_oauth_states").select("state,tenant_id,integration_id,region,redirect_uri,expires_at,consumed_at").eq("state", data.state).maybeSingle();
      if (!oauthState || oauthState.tenant_id !== tenantId || !oauthState.integration_id || oauthState.consumed_at || new Date(oauthState.expires_at).getTime() < Date.now()) throw new errors.IntegrationError("oauth_state_invalid");
      await supabaseAdmin.from("integration_oauth_states").update({ consumed_at: new Date().toISOString() }).eq("state", data.state);

      const { data: credentials } = await supabaseAdmin.from("integration_credentials").select("client_id,client_secret").eq("integration_id", oauthState.integration_id).eq("tenant_id", tenantId).maybeSingle();
      if (!credentials?.client_id || !credentials.client_secret) throw new errors.IntegrationError("not_configured", "The OAuth client configuration for this integration is missing.");
      const region = errors.normalizeGenesysRegion(oauthState.region);
      const tokens = await instanceOAuth.exchangeAuthorizationCode({ code: data.code, redirectUri: oauthState.redirect_uri, region, credentials: { clientId: credentials.client_id, clientSecret: credentials.client_secret } });
      const { org, me } = await instanceOAuth.healthCheck(tokens.accessToken, region);

      const { data: duplicate } = await supabaseAdmin.from("integrations").select("id,display_name").eq("tenant_id", tenantId).eq("provider", "genesys").eq("external_org_id", org.id).neq("id", oauthState.integration_id).maybeSingle();
      if (duplicate) throw new errors.IntegrationError("provider_error", `Genesys organization ${org.name} is already connected as ${duplicate.display_name || duplicate.id}.`);

      await supabaseAdmin.from("integration_credentials").update({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken, token_type: tokens.tokenType, expires_at: tokens.expiresAt, scopes: tokens.scopes, updated_at: new Date().toISOString() }).eq("integration_id", oauthState.integration_id).eq("tenant_id", tenantId);
      const { error: markError } = await supabaseAdmin.from("integrations").update({ status: "connected", health_status: "healthy", health_detail: null, region, external_org_id: org.id, external_org_name: org.name, scopes: tokens.scopes, connected_at: new Date().toISOString(), connected_by: context.userId }).eq("id", oauthState.integration_id).eq("tenant_id", tenantId);
      if (markError) throw new errors.IntegrationError("provider_error", markError.message);
      await store.writeIntegrationAudit(context.supabase, { tenantId, action: "integration.oauth_completed", entityId: oauthState.integration_id, detail: `Genesys authorization completed for organization ${org.name}.`, payload: { provider: "genesys", orgId: org.id, orgName: org.name, authorizedBy: me.email } });
      return { ok: true as const, orgName: org.name, region };
    } catch (error) { return { ok: false as const, errorCode: errors.toErrorCode(error), errorMessage: errors.toErrorMessage(error) }; }
  });

export const verifyGenesysConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { integrationId?: string }) => ({ integrationId: String(input?.integrationId ?? "").trim() }))
  .handler(async ({ data, context }) => {
    const store = await import("./genesys/store.server"); const errors = await import("./genesys/errors"); const instanceOAuth = await import("./genesys/instance-oauth.server");
    try {
      const { tenantId } = await store.requireManage(context.supabase, context.userId); const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: integration } = await supabaseAdmin.from("integrations").select("id,region").eq("id", data.integrationId).eq("tenant_id", tenantId).eq("provider", "genesys").maybeSingle();
      if (!integration) throw new errors.IntegrationError("not_connected");
      const { data: credentials } = await supabaseAdmin.from("integration_credentials").select("client_id,client_secret,access_token,refresh_token,expires_at").eq("integration_id", integration.id).eq("tenant_id", tenantId).maybeSingle();
      if (!credentials?.access_token) throw new errors.IntegrationError("not_connected");
      let accessToken = credentials.access_token;
      if (credentials.expires_at && new Date(credentials.expires_at).getTime() - Date.now() < 120_000 && credentials.refresh_token && credentials.client_id && credentials.client_secret) {
        const refreshed = await instanceOAuth.refreshAccessToken({ refreshToken: credentials.refresh_token, region: integration.region, credentials: { clientId: credentials.client_id, clientSecret: credentials.client_secret } });
        accessToken = refreshed.accessToken;
        await supabaseAdmin.from("integration_credentials").update({ access_token: refreshed.accessToken, refresh_token: refreshed.refreshToken ?? credentials.refresh_token, token_type: refreshed.tokenType, expires_at: refreshed.expiresAt, scopes: refreshed.scopes, updated_at: new Date().toISOString() }).eq("integration_id", integration.id).eq("tenant_id", tenantId);
      }
      const { org } = await instanceOAuth.healthCheck(accessToken, integration.region);
      await supabaseAdmin.from("integrations").update({ status: "connected", health_status: "healthy", health_detail: null, external_org_id: org.id, external_org_name: org.name }).eq("id", integration.id).eq("tenant_id", tenantId);
      return { ok: true as const, orgName: org.name, healthStatus: "healthy" };
    } catch (error) { return { ok: false as const, errorCode: errors.toErrorCode(error), errorMessage: errors.toErrorMessage(error) }; }
  });

export const syncGenesysNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { integrationId?: string }) => ({ integrationId: String(input?.integrationId ?? "").trim() }))
  .handler(async ({ data, context }) => {
    const store = await import("./genesys/store.server"); const errors = await import("./genesys/errors");
    try {
      const { tenantId } = await store.requireManage(context.supabase, context.userId); const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: integration } = await supabaseAdmin.from("integrations").select("id,region").eq("id", data.integrationId).eq("tenant_id", tenantId).eq("provider", "genesys").maybeSingle();
      if (!integration) throw new errors.IntegrationError("not_connected");
      // The existing sync implementation is already tenant-scoped and keyed by integration_id.
      // It will use the stored instance credentials for new integrations once the connector refresh path is selected.
      const result = await store.runSync(context.supabase, context.userId, tenantId, integration.id, integration.region);
      return { ok: result.status === "success", ...result };
    } catch (error) { return { ok: false, status: "failed" as const, errorCode: errors.toErrorCode(error), errorMessage: errors.toErrorMessage(error) }; }
  });

export const disconnectGenesys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { integrationId?: string }) => ({ integrationId: String(input?.integrationId ?? "").trim() }))
  .handler(async ({ data, context }) => {
    const store = await import("./genesys/store.server"); const errors = await import("./genesys/errors");
    try { const { tenantId } = await store.requireManage(context.supabase, context.userId); const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); const { data: integration } = await supabaseAdmin.from("integrations").select("id").eq("id", data.integrationId).eq("tenant_id", tenantId).eq("provider", "genesys").maybeSingle(); if (!integration) throw new errors.IntegrationError("not_connected"); await store.disconnect(context.supabase, tenantId, integration.id); return { ok: true as const }; }
    catch (error) { return { ok: false as const, errorCode: errors.toErrorCode(error), errorMessage: errors.toErrorMessage(error) }; }
  });

export const getGenesysSyncHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { integrationId?: string }) => ({ integrationId: String(input?.integrationId ?? "").trim() }))
  .handler(async ({ data, context }) => {
    const store = await import("./genesys/store.server");
    try { const { tenantId } = await store.resolveTenant(context.supabase, context.userId); const { data: rows } = await context.supabase.from("integration_sync_runs").select("id, status, started_at, finished_at, error_code, error_message, stats").eq("tenant_id", tenantId).eq("integration_id", data.integrationId).order("started_at", { ascending: false }).limit(10); return { runs: rows ?? [] }; }
    catch { return { runs: [] }; }
  });
