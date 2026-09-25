import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export const provisionPersonalWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkspaceProvisionResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("provision_personal_workspace", {
      p_user_id: context.userId,
    });
    if (error || !data || typeof data !== "object" || Array.isArray(data)) {
      console.error("[workspace-provision] failed", { userId: context.userId, error: error?.message });
      throw new Error("We could not set up your workspace. Please retry or sign out.");
    }
    return data as WorkspaceProvisionResult;
  });
