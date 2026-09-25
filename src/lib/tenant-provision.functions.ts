import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

export type WorkspaceRole = "admin" | "manager" | "analyst" | "viewer";
export type WorkspaceEnvironmentMode = "live" | "demo";

export interface WorkspaceProvisionResult {
  tenantId: string;
  tenantName: string;
  primaryDomain: string | null;
  roles: WorkspaceRole[];
  role: WorkspaceRole | null;
  environmentMode: WorkspaceEnvironmentMode;
  created: boolean;
  via: "existing" | "provisioned";
}

const validRoles = new Set<WorkspaceRole>(["admin", "manager", "analyst", "viewer"]);

function parseWorkspaceProvisionResult(value: Json): WorkspaceProvisionResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Workspace provisioning returned an invalid result.");
  }

  const row = value as { [key: string]: Json | undefined };
  const tenantId = row.tenantId;
  const tenantName = row.tenantName;
  const primaryDomain = row.primaryDomain;
  const roles = row.roles;
  const role = row.role;
  const environmentMode = row.environmentMode;
  const created = row.created;
  const via = row.via;

  if (
    typeof tenantId !== "string" ||
    !tenantId ||
    typeof tenantName !== "string" ||
    !tenantName ||
    !(primaryDomain === null || typeof primaryDomain === "string") ||
    !Array.isArray(roles) ||
    !roles.every((item) => typeof item === "string" && validRoles.has(item as WorkspaceRole)) ||
    !(role === null || (typeof role === "string" && validRoles.has(role as WorkspaceRole))) ||
    (environmentMode !== "live" && environmentMode !== "demo") ||
    typeof created !== "boolean" ||
    (via !== "existing" && via !== "provisioned")
  ) {
    throw new Error("Workspace provisioning returned an invalid result.");
  }

  return {
    tenantId,
    tenantName,
    primaryDomain,
    roles: roles as WorkspaceRole[],
    role: role as WorkspaceRole | null,
    environmentMode,
    created,
    via,
  };
}

export const provisionPersonalWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkspaceProvisionResult> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin.rpc("provision_personal_workspace", {
        p_user_id: context.userId,
      });

      if (error) throw error;
      return parseWorkspaceProvisionResult(data);
    } catch (error) {
      console.error("[workspace-provision] failed", {
        userId: context.userId,
        error: error instanceof Error ? error.message : "Unknown provisioning error",
      });
      throw new Error("We could not set up your workspace. Please retry or sign out.");
    }
  });
