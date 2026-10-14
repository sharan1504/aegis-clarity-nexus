import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenantContext } from "@/lib/tenant-context.server";
import { getCredentialEncryptionHealth } from "./credential-vault.server";

export const getCredentialEncryptionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    if (!tenant.canManage) throw new Error("Admin or manager access is required.");
    return getCredentialEncryptionHealth();
  });
