/**
 * Server functions for the GitHub App installation flow.
 *
 * The browser never sees the app private key, the state signing secret, or an
 * installation token. It only receives the GitHub installation URL to redirect
 * to and the outcome of the verified setup callback.
 */
import crypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenantContext } from "@/lib/tenant-context.server";
import { recordOperationalIssueSafely } from "@/lib/operational-issues.server";
import {
  assertStateMatchesActor,
  buildInstallUrl,
  getGitHubAppConfig,
  getInstallation,
  mintInstallationToken,
  resolveStateSecret,
  signInstallState,
  verifyInstallState,
  verifyInstallationRepositories,
  type GitHubAppInstallationCredentials,
} from "./github-app.server";

function encryptCredentials(value: unknown): string {
  const keyHex = process.env.AEGIS_CREDENTIAL_ENCRYPTION_KEY;
  if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) throw new Error("AEGIS_CREDENTIAL_ENCRYPTION_KEY is not configured on the server.");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

async function requireAdminOrManager(supabase: Parameters<typeof resolveTenantContext>[0], userId: string) {
  const context = await resolveTenantContext(supabase, userId);
  if (!context.roles.some((role) => role === "admin" || role === "manager")) {
    throw new Error("Admin or manager access is required to manage the GitHub integration.");
  }
  return context;
}

/** Step 1: mint a signed, tenant/user-bound state and return the install URL. */
export const startGitHubAppInstall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { connectionId?: string; displayName?: string; environment?: string } | undefined) => ({
    connectionId: input?.connectionId ? String(input.connectionId) : undefined,
    displayName: input?.displayName ? String(input.displayName).slice(0, 120) : undefined,
    environment: input?.environment ? String(input.environment).slice(0, 60) : undefined,
  }))
  .handler(async ({ data, context }) => {
    try {
      const tenant = await requireAdminOrManager(context.supabase, context.userId);
      const config = getGitHubAppConfig();
      const state = signInstallState(
        { tenantId: tenant.tenantId, userId: context.userId, connectionId: data.connectionId, displayName: data.displayName, environment: data.environment },
        resolveStateSecret(),
      );
      return { ok: true as const, installUrl: buildInstallUrl(config.slug, state) };
    } catch (error) {
      return { ok: false as const, errorMessage: error instanceof Error ? error.message : "The GitHub App installation could not be started." };
    }
  });

/** Step 2: validate the signed state, verify the installation, persist identity. */
export const completeGitHubAppInstall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { installationId?: string; state?: string; setupAction?: string }) => ({
    installationId: String(input.installationId ?? "").trim(),
    state: String(input.state ?? "").trim(),
    setupAction: String(input.setupAction ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    let tenantId: string | null = null;
    try {
      const tenant = await requireAdminOrManager(context.supabase, context.userId);
      tenantId = tenant.tenantId;
      const installState = verifyInstallState(data.state, resolveStateSecret());
      assertStateMatchesActor(installState, { tenantId: tenant.tenantId, userId: context.userId });
      if (!/^\d+$/.test(data.installationId)) throw new Error("GitHub did not return a valid installation identifier.");

      const config = getGitHubAppConfig();
      // installation_id is untrusted: confirm it against GitHub with an app JWT.
      const installation = await getInstallation(data.installationId, config);
      const { token, expiresAt } = await mintInstallationToken(installation.installationId, config);
      const repositories = await verifyInstallationRepositories(token);

      const credentials: GitHubAppInstallationCredentials = {
        authType: "github_app",
        installationId: installation.installationId,
        accountId: installation.accountId,
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
      };

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const now = new Date().toISOString();
      const existing = installState.connectionId
        ? { id: installState.connectionId }
        : (await supabaseAdmin.from("provider_connections").select("id").eq("tenant_id", tenant.tenantId).eq("provider", "github").eq("external_id", installation.accountId).maybeSingle()).data;

      const { data: connection, error } = await supabaseAdmin
        .from("provider_connections")
        .upsert(
          {
            id: existing?.id ?? undefined,
            tenant_id: tenant.tenantId,
            provider: "github",
            external_id: installation.accountId,
            display_name: installState.displayName?.trim() || installation.accountLogin,
            environment: installState.environment?.trim() || "Production",
            status: "connected",
            encrypted_credentials: encryptCredentials(credentials),
            // Installation tokens are short-lived and never persisted; this only
            // records when the verified token would have expired.
            credential_expires_at: null,
            last_error: null,
            created_by: context.userId,
            connected_at: now,
            updated_at: now,
          },
          { onConflict: "id" },
        )
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      await supabaseAdmin.from("audit_log").insert({
        tenant_id: tenant.tenantId,
        action: "github.app_installation.connected",
        entity_type: "provider_connection",
        entity_id: connection.id,
        detail: `GitHub App installed for ${installation.accountLogin} (${installation.accountType}).`,
        payload: {
          installationId: installation.installationId,
          accountId: installation.accountId,
          accountLogin: installation.accountLogin,
          accountType: installation.accountType,
          repositorySelection: installation.repositorySelection,
          repositoriesVisible: repositories.totalCount,
          setupAction: data.setupAction || null,
          installationTokenExpiresAt: expiresAt,
        },
      });

      return { ok: true as const, connectionId: connection.id, accountLogin: installation.accountLogin, repositoriesVisible: repositories.totalCount };
    } catch (error) {
      const message = error instanceof Error ? error.message : "The GitHub App installation could not be verified.";
      if (tenantId) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("audit_log").insert({
          tenant_id: tenantId,
          action: "github.app_installation.failed",
          entity_type: "provider_connection",
          entity_id: null,
          detail: "GitHub App installation verification failed.",
          payload: { error: message.slice(0, 2000), setupAction: data.setupAction || null },
        });
        await recordOperationalIssueSafely(context.supabase, {
          tenantId,
          source: "integration_health",
          severity: "high",
          title: "GitHub App installation failed",
          detail: `A GitHub App installation could not be verified. ${message}`,
        });
      }
      return { ok: false as const, errorMessage: message };
    }
  });
