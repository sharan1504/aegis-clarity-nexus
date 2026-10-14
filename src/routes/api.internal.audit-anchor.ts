import { createFileRoute } from "@tanstack/react-router";
import { deliverPendingAuditAnchors } from "@/lib/audit-anchor.server";

export const Route = createFileRoute("/api/internal/audit-anchor")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.AUDIT_ANCHOR_WORKER_SECRET;
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}` || request.headers.get("x-aegis-job-worker") !== "pg-boss") {
          return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const result = await deliverPendingAuditAnchors(supabaseAdmin as any);
          return Response.json({ ok: result.failed === 0, ...result }, { status: result.failed === 0 ? 200 : 502 });
        } catch (error) {
          return Response.json({ ok: false, error: error instanceof Error ? error.message : "Audit anchoring failed." }, { status: 503 });
        }
      },
    },
  },
});
