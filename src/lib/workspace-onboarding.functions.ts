import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

export type WorkspaceSetupRole = "admin" | "manager" | "analyst" | "viewer";

const validRoles = new Set<WorkspaceSetupRole>(["admin", "manager", "analyst", "viewer"]);

export interface WorkspaceSetupState {
  needsSetup: boolean;
  tenantId: string | null;
  tenantName: string | null;
  description: string | null;
  primaryDomain: string | null;
  roles: WorkspaceSetupRole[];
  role: WorkspaceSetupRole | null;
  environmentMode: "live" | "demo" | null;
}

function parseRoles(value: unknown): WorkspaceSetupRole[] {
  if (!Array.isArray(value)) return [];
  return value.filter((role): role is WorkspaceSetupRole =>
    typeof role === "string" && validRoles.has(role as WorkspaceSetupRole),
  );
}

export const getWorkspaceSetupState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkspaceSetupState> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("id", context.userId)
      .maybeSingle();

    if (profileError) throw new Error("Unable to inspect workspace membership: " + profileError.message);

    let tenantId = profile?.tenant_id ?? null;

    if (!tenantId) {
      const { data: memberships, error: membershipError } = await supabaseAdmin
        .from("user_roles")
        .select("tenant_id")
        .eq("user_id", context.userId);

      if (membershipError) throw new Error("Unable to inspect workspace membership: " + membershipError.message);
      const distinctTenantIds = [...new Set((memberships ?? []).map((row) => row.tenant_id).filter(Boolean))];

      if (distinctTenantIds.length === 1) {
        tenantId = distinctTenantIds[0];
        await supabaseAdmin.from("profiles").upsert({ id: context.userId, tenant_id: tenantId }, { onConflict: "id" });
      } else if (distinctTenantIds.length > 1) {
        throw new Error("Your account has memberships in multiple workspaces. Please contact an administrator.");
      }
    }

    if (!tenantId) {
      return {
        needsSetup: true,
        tenantId: null,
        tenantName: null,
        description: null,
        primaryDomain: null,
        roles: [],
        role: null,
        environmentMode: null,
      };
    }

    const [{ data: tenant, error: tenantError }, { data: roleRows, error: rolesError }] = await Promise.all([
      supabaseAdmin
        .from("tenants")
        .select("id,name,description,primary_domain,environment_mode")
        .eq("id", tenantId)
        .single(),
      supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .eq("tenant_id", tenantId),
    ]);

    if (tenantError || !tenant) {
      throw new Error("Unable to load workspace: " + (tenantError?.message ?? "workspace not found"));
    }
    if (rolesError) throw new Error("Unable to load workspace role: " + rolesError.message);

    const roles = parseRoles((roleRows ?? []).map((row) => row.role));
    if (!roles.length) throw new Error("Your workspace membership does not have a valid role.");

    return {
      needsSetup: false,
      tenantId: tenant.id,
      tenantName: tenant.name,
      description: tenant.description ?? null,
      primaryDomain: tenant.primary_domain ?? null,
      roles,
      role: roles[0] ?? null,
      environmentMode: tenant.environment_mode === "demo" ? "demo" : "live",
    };
  });

export const createWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    name: string;
    description?: string;
    role: WorkspaceSetupRole;
  }) => ({
    name: String(input?.name ?? "").trim(),
    description: String(input?.description ?? "").trim().slice(0, 500),
    role: input?.role,
  }))
  .handler(async ({ data, context }) => {
    if (!data.name || data.name.length < 2 || data.name.length > 80) {
      throw new Error("Workspace name must be between 2 and 80 characters.");
    }
    if (!validRoles.has(data.role)) throw new Error("Select a valid workspace role.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("create_workspace_for_user", {
      p_user_id: context.userId,
      p_name: data.name,
      p_description: data.description || null,
      p_role: data.role,
    });

    if (error) {
      console.error("[workspace-create] failed", {
        userId: context.userId,
        error: error.message,
      });
      throw new Error(
        error.message.includes("already attached")
          ? "Your account is already attached to a workspace."
          : "We could not create your workspace. Please retry.",
      );
    }

    const row = result as Json;
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("Workspace creation returned an invalid result.");
    }

    return {
      tenantId: String((row as Record<string, Json>).tenantId),
      tenantName: String((row as Record<string, Json>).tenantName),
      role: data.role,
      environmentMode: "live" as const,
    };
  });
