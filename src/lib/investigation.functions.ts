import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listInvestigations, loadInvestigation } from "@/lib/investigation.server";

export type { Investigation, InvestigationSummary, InvestigationConfidence, InvestigationEvidenceItem, InvestigationTimelineItem, InvestigationCorrelation } from "@/lib/investigation.server";

export const getInvestigations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listInvestigations(context.supabase, context.userId));

export const getInvestigation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { key: string }) => {
    const key = String(input?.key ?? "").trim();
    if (!key) throw new Error("An investigation key is required.");
    return { key };
  })
  .handler(async ({ data, context }) => loadInvestigation(context.supabase, context.userId, data.key));
