import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadCommandCenterData } from "@/lib/command-center.server";
import { resolveTenantContext } from "@/lib/tenant-context.server";
import { recordOperationalIssueSafely } from "@/lib/operational-issues.server";

export type { CommandCenterData, CommandCenterChange, CommandCenterSignal } from "@/lib/command-center.server";

export const getCommandCenterData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try { return await loadCommandCenterData(context.supabase, context.userId); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        const tenant = await resolveTenantContext(context.supabase, context.userId);
        if (tenant.environmentMode === "live") await recordOperationalIssueSafely(context.supabase, { tenantId: tenant.tenantId, source: "command_center", severity: "high", title: "Command Center data load failed", detail: `The Command Center could not load its live operational data. ${message}`, fingerprint: `command-center-load:${message}` });
      } catch (captureError) { console.error("[command-center] operational issue capture failed", captureError); }
      throw error;
    }
  });
