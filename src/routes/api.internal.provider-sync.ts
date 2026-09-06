import { createFileRoute } from "@tanstack/react-router";
import { syncGitHub, type GitHubEntityScope } from "@/lib/integrations/github-connector.server";

export const Route = createFileRoute("/api/internal/provider-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.PROVIDER_SYNC_INTERNAL_SECRET;
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}` || request.headers.get("x-aegis-job-worker") !== "pg-boss") return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        const body = await request.json() as { tenantId?: string; integrationId?: string; provider?: string; syncRunId?: string; entityScope?: GitHubEntityScope; idempotencyKey?: string };
        if (!body.tenantId || !body.integrationId || !body.provider || !body.syncRunId || !body.idempotencyKey) return Response.json({ ok: false, error: "tenantId, integrationId, provider, syncRunId and idempotencyKey are required." }, { status: 400 });
        if (body.provider !== "github") return Response.json({ ok: false, error: `Provider ${body.provider} is not implemented by this handler.` }, { status: 400 });
        try { const result = await syncGitHub(body.tenantId, body.integrationId, body.entityScope ?? "all", body.syncRunId, body.idempotencyKey); return Response.json({ ok: true, result }); }
        catch (error) { return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
      },
    },
  },
});
