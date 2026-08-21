import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadLiveWorkspaceData } from "@/lib/live-workspace.functions";
import { loadProviderReportData } from "@/lib/provider-sync.functions";

export const getReportWorkspaceData = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const [genesys, providers] = await Promise.all([
    loadLiveWorkspaceData(context.supabase, context.userId),
    loadProviderReportData(context.supabase, context.userId),
  ]);
  return { genesys, providers, fetchedAt: new Date().toISOString() };
});
