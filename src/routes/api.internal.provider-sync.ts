import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptCredentials } from "@/lib/integrations/credential-vault.server";
import { recordOperationalIssueSafely } from "@/lib/operational-issues.server";
import { fetchProvider, persistProviderSyncRows, type Provider } from "@/lib/provider-sync.functions";
import { syncGitHub, type GitHubEntityScope } from "@/lib/integrations/github-connector.server";

const GENERIC_SCHEDULED_PROVIDERS = new Set<Provider>(["m365", "jira", "slack"]);

export const Route = createFileRoute("/api/internal/provider-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.PROVIDER_SYNC_INTERNAL_SECRET;
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}` || request.headers.get("x-aegis-job-worker") !== "pg-boss") {
          return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json() as {
          tenantId?: string;
          connectionId?: string;
          integrationId?: string | null;
          provider?: Provider;
          syncRunId?: string;
          entityScope?: GitHubEntityScope;
          idempotencyKey?: string;
        };
        if (!body.tenantId || !body.connectionId || !body.provider || !body.syncRunId || !body.idempotencyKey) {
          return Response.json({ ok: false, error: "tenantId, connectionId, provider, syncRunId and idempotencyKey are required." }, { status: 400 });
        }

        try {
          const { data: connection, error: connectionError } = await supabaseAdmin
            .from("provider_connections")
            .select("id,tenant_id,provider,status,encrypted_credentials,integration_id")
            .eq("tenant_id", body.tenantId)
            .eq("id", body.connectionId)
            .eq("provider", body.provider)
            .maybeSingle();
          if (connectionError) throw connectionError;
          if (!connection || connection.status !== "connected" || !connection.encrypted_credentials) {
            throw new Error("The scheduled provider connection is not connected or has no server-side credentials.");
          }

          const { data: priorRun, error: priorRunError } = await supabaseAdmin
            .from("provider_sync_runs")
            .select("id,status")
            .eq("tenant_id", body.tenantId)
            .eq("connection_id", body.connectionId)
            .eq("idempotency_key", body.idempotencyKey)
            .maybeSingle();
          if (priorRunError) throw priorRunError;
          if (priorRun?.status === "success") return Response.json({ ok: true, skipped: true, reason: "already-succeeded" });

          if (body.provider === "github") {
            const result = await syncGitHub(body.tenantId, body.connectionId, body.entityScope ?? "all", body.syncRunId, body.idempotencyKey);
            return Response.json({ ok: true, result });
          }

          if (!GENERIC_SCHEDULED_PROVIDERS.has(body.provider)) {
            return Response.json({ ok: false, error: `Provider ${body.provider} scheduled sync is coming soon.` }, { status: 400 });
          }

          const credentials = decryptCredentials<Record<string, unknown>>(connection.encrypted_credentials);
          const rows = await fetchProvider(body.provider, credentials as never, body.connectionId, body.tenantId);
          const observedAt = new Date().toISOString();
          const staleCount = await persistProviderSyncRows(supabaseAdmin, body.tenantId, body.provider, body.connectionId, body.syncRunId, rows, observedAt);
          const finishedAt = new Date().toISOString();

          const { error: runError } = await supabaseAdmin
            .from("provider_sync_runs")
            .update({ status: "success", finished_at: finishedAt, records_seen: rows.length, records_upserted: rows.length, records_staled: staleCount, error_message: null })
            .eq("id", body.syncRunId).eq("tenant_id", body.tenantId);
          if (runError) throw runError;

          const { error: connectionUpdateError } = await supabaseAdmin.from("provider_connections").update({
            status: "connected",
            health_status: "healthy",
            health_checked_at: finishedAt,
            health_error: null,
            last_sync_at: finishedAt,
            last_sync_status: "success",
            last_sync_successful_at: finishedAt,
            sync_record_count: rows.length,
            sync_error: null,
            last_error: null,
          }).eq("id", body.connectionId).eq("tenant_id", body.tenantId);
          if (connectionUpdateError) throw connectionUpdateError;

          if (connection.integration_id) {
            await supabaseAdmin.from("integrations").update({ last_sync_attempted_at: finishedAt })
              .eq("id", connection.integration_id).eq("tenant_id", body.tenantId);
          }

          return Response.json({ ok: true, result: { provider: body.provider, connectionId: body.connectionId, records: rows.length, stale: staleCount, finishedAt } });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await supabaseAdmin.from("provider_sync_runs").update({
            status: "failed",
            finished_at: new Date().toISOString(),
            error_message: message.slice(0, 2000),
          }).eq("id", body.syncRunId).eq("tenant_id", body.tenantId);
          await supabaseAdmin.from("provider_connections").update({
            status: "failed",
            health_status: "unhealthy",
            health_checked_at: new Date().toISOString(),
            health_error: message.slice(0, 2000),
            last_sync_status: "failed",
            sync_error: message.slice(0, 2000),
            last_error: message.slice(0, 2000),
          }).eq("id", body.connectionId).eq("tenant_id", body.tenantId);
          await recordOperationalIssueSafely(supabaseAdmin as any, {
            tenantId: body.tenantId,
            source: "sync",
            severity: "high",
            title: `${body.provider ?? "Provider"} scheduled sync failed`,
            detail: `Scheduled synchronization failed for connection ${body.connectionId}. ${message}`,
            relatedId: body.syncRunId,
          });
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
