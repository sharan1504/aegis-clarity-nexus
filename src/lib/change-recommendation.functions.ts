import crypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function riskTier(value: string | undefined): "Low" | "Medium" | "High" | "Critical" | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized?.includes("critical")) return "Critical";
  if (normalized?.includes("high")) return "High";
  if (normalized?.includes("medium")) return "Medium";
  if (normalized?.includes("low")) return "Low";
  return null;
}

export const createChangeFromRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { title?: string; rationale?: string; impact?: string; risk?: string; nextStep?: string }) => input)
  .handler(async ({ data, context }) => {
    const title = String(data.title ?? "").trim();
    const rationale = String(data.rationale ?? "").trim();
    const impact = String(data.impact ?? "").trim();
    const riskText = String(data.risk ?? "").trim();
    if (!title || !rationale) return { ok: false as const, error: "The recommendation is missing a title or rationale." };
    const tier = riskTier(riskText);
    if (!tier) return { ok: false as const, error: "This recommendation has no explicit risk classification, so it cannot be sent to approvals yet." };

    const { data: profile, error: profileError } = await context.supabase
      .from("profiles").select("tenant_id").eq("id", context.userId).maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.tenant_id) return { ok: false as const, error: "Your workspace is not ready for approval records." };

    const rowId = crypto.randomUUID();
    const changeId = `CHG-${rowId.slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    const factors = [riskText, impact].filter(Boolean);
    const { error } = await context.supabase.from("change_records").insert({
      id: rowId,
      tenant_id: profile.tenant_id,
      change_id: changeId,
      title,
      stage: "Proposed",
      severity: tier === "Critical" ? "critical" : tier === "High" ? "high" : tier === "Medium" ? "medium" : "low",
      risk: { tier, score: 0, scoreAvailable: false, factors },
      execution_mode: "Manual",
      owner_team: "Unassigned",
      requester: "Enterprise AI",
      category: "AI Recommendation",
      agent: "Enterprise AI",
      change_window: {},
      business_impact: impact || null,
      ai_reasoning: [rationale, data.nextStep ? `Recommended next step: ${String(data.nextStep).trim()}` : ""].filter(Boolean).join("\n\n"),
      rollback_steps: [],
      validations: [],
      external_tickets: [],
      timeline: [{ ts: now, actor: "Enterprise AI", kind: "system", text: "Recommendation sent to the approval center for human review." }],
    });
    if (error) throw error;

    const { error: auditError } = await context.supabase.from("audit_log").insert({
      tenant_id: profile.tenant_id,
      action: "change.created",
      entity_type: "change_record",
      entity_id: changeId,
      detail: `${title} created from an Enterprise AI recommendation.`,
      payload: { source: "enterprise_ai_recommendation", changeId },
    });
    if (auditError) throw auditError;

    return { ok: true as const, id: changeId, rowId };
  });
