import { createFileRoute } from "@tanstack/react-router";
import { handleN8nCallback } from "@/lib/automation/n8n-automation.server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/automation/n8n-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const signature = request.headers.get("x-aegis-signature") ?? "";
        const runId = request.headers.get("x-aegis-automation-run-id") ?? "";

        if (!runId || !signature) {
          return Response.json({ ok: false, error: "Missing automation callback authentication." }, { status: 401 });
        }

        const url = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !serviceKey) {
          return Response.json({ ok: false, error: "Automation callback infrastructure is unavailable." }, { status: 503 });
        }

        try {
          const supabase = createClient<Database>(url, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const payload = JSON.parse(rawBody) as {
            automationRunId: string;
            status: "succeeded" | "failed" | "cancelled";
            externalExecutionId?: string | null;
            result?: unknown;
            error?: string | null;
          };
          await handleN8nCallback(supabase, runId, rawBody, signature, payload);
          return Response.json({ ok: true });
        } catch (error) {
          return Response.json(
            { ok: false, error: error instanceof Error ? error.message : "Automation callback failed." },
            { status: 400 },
          );
        }
      },
    },
  },
});
