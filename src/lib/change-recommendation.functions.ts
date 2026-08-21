import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";
import { createProposedChangeRecord } from "@/lib/change-proposal.server";

function riskTier(value: string | undefined): "Low" | "Medium" | "High" | "Critical" | null { const normalized = value?.trim().toLowerCase(); if (normalized?.includes("critical")) return "Critical"; if (normalized?.includes("high")) return "High"; if (normalized?.includes("medium")) return "Medium"; if (normalized?.includes("low")) return "Low"; return null; }
export const createChangeFromRecommendation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { title?: string; rationale?: string; impact?: string; risk?: string; nextStep?: string }) => input).handler(async ({ data, context }) => {
  const title = String(data.title ?? "").trim(); const rationale = String(data.rationale ?? "").trim(); const impact = String(data.impact ?? "").trim(); const riskText = String(data.risk ?? "").trim(); if (!title || !rationale) return { ok: false as const, error: "The recommendation is missing a title or rationale." }; const tier = riskTier(riskText); if (!tier) return { ok: false as const, error: "This recommendation has no explicit risk classification, so it cannot be sent to approvals yet." };
  const { tenantId, actorRole } = await resolveTenant(context.supabase, context.userId);
  const result = await createProposedChangeRecord(context.supabase, { userId: context.userId, tenantId, actorRole }, { title, businessImpact: impact || "Not specified by the recommendation.", aiReasoning: [rationale, data.nextStep ? `Recommended next step: ${String(data.nextStep).trim()}` : ""].filter(Boolean).join("\n\n"), proposedRiskFactors: [riskText, impact].filter(Boolean), proposedRiskTier: tier, targetProvider: "Not specified", targetAgent: "Enterprise AI" });
  return { ok: true as const, id: result.changeId, rowId: result.id };
});
