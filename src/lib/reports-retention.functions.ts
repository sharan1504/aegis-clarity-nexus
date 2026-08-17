// Export retention enforcement. Stored report files are removed from the
// private `reports` bucket once they pass the workspace retention window, while
// their history metadata (name, format, size, params, audit trail) is kept.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface PurgeResult {
  retentionDays: number;
  purged: number;
}

export const purgeExpiredReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PurgeResult> => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", context.userId)
      .maybeSingle();

    const tenantId = profile?.tenant_id;
    if (!tenantId) return { retentionDays: 0, purged: 0 };

    // Deleting export files is an admin-only action under RLS ("Admins can
    // delete reports"). The privileged client below bypasses RLS, so the same
    // role requirement is re-checked here through the caller's own session
    // before any destructive work happens.
    const { data: adminRole } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("tenant_id", tenantId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRole) {
      throw new Error("Only workspace admins can purge expired export files.");
    }

    const { data: tenant } = await context.supabase
      .from("tenants")
      .select("report_retention_days")
      .eq("id", tenantId)
      .maybeSingle();

    const retentionDays = tenant?.report_retention_days ?? 30;
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();

    // Admin membership is proven above through the RLS-scoped reads; the
    // privileged client only deletes storage objects and stamps purged_at.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: stale } = await supabaseAdmin
      .from("reports")
      .select("id, storage_path")
      .eq("tenant_id", tenantId)
      .is("purged_at", null)
      .lt("created_at", cutoff)
      .limit(200);

    if (!stale?.length) return { retentionDays, purged: 0 };

    await supabaseAdmin.storage.from("reports").remove(stale.map((r) => r.storage_path));

    const now = new Date().toISOString();
    await supabaseAdmin
      .from("reports")
      .update({ purged_at: now })
      .in(
        "id",
        stale.map((r) => r.id),
      );

    await supabaseAdmin.from("audit_log").insert({
      tenant_id: tenantId,
      actor_id: context.userId,
      action: "report.retention_purged",
      entity_type: "report",
      entity_id: null,
      detail: `${stale.length} export file(s) deleted from storage after ${retentionDays}-day retention window. Metadata retained.`,
      payload: { retentionDays, purgedIds: stale.map((r) => r.id) },
    });

    return { retentionDays, purged: stale.length };
  });

export const setReportRetentionDays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { days: number }) => {
    const days = Math.round(Number(data?.days));
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      throw new Error("Retention must be between 1 and 365 days");
    }
    return { days };
  })
  .handler(async ({ context, data }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.tenant_id) throw new Error("No workspace");

    // RLS restricts tenant updates to workspace admins.
    const { error } = await context.supabase
      .from("tenants")
      .update({ report_retention_days: data.days })
      .eq("id", profile.tenant_id);
    if (error) throw new Error("Only workspace admins can change the retention policy");

    return { retentionDays: data.days };
  });

export const getReportRetentionDays = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.tenant_id) return { retentionDays: 30 };
    const { data: tenant } = await context.supabase
      .from("tenants")
      .select("report_retention_days")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    return { retentionDays: tenant?.report_retention_days ?? 30 };
  });
