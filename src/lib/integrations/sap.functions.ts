import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";
import { startSapOAuth as startSap, completeSapOAuth as completeSap } from "./oauth-sap.server";

async function tenantFor(context: any) {
  const { tenantId, roles } = await resolveTenant(context.supabase, context.userId);
  if (!roles.includes("admin") && !roles.includes("manager")) throw new Error("Admin/manager access is required to connect an integration.");
  return tenantId;
}

export const startSapOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { connectionId?: string; clientId: string; clientSecret: string; authorizationUrl: string; tokenUrl: string; apiBaseUrl?: string; scope?: string; redirectUri: string; displayName?: string; environment?: string }) => input)
  .handler(async ({ data, context }) => startSap({ tenantId: await tenantFor(context), ...data }));

export const completeSapOAuth = createServerFn({ method: "POST" })
  .inputValidator((input: { state: string; code: string }) => input)
  .handler(async ({ data }) => completeSap(data.state, data.code));
