import type { UserClient } from "@/lib/execution/gateway.server";
import { writeAuditServer } from "@/lib/audit.server";
import type { Json } from "@/integrations/supabase/types";

export interface ProposedChangeInput { title: string; businessImpact: string; aiReasoning: string; proposedRiskFactors: string[]; targetProvider: string; targetAgent: string; proposedRiskTier?: "Low" | "Medium" | "High" | "Critical"; }

export async function createProposedChangeRecord(supabase: UserClient, actor: { userId: string; tenantId: string; actorRole: string }, input: ProposedChangeInput) {
  const title = input.title.trim(); const businessImpact = input.businessImpact.trim(); const aiReasoning = input.aiReasoning.trim(); const provider = input.targetProvider.trim(); const agent = input.targetAgent.trim(); const factors = [...new Set(input.proposedRiskFactors.map((factor) => factor.trim()).filter(Boolean))];
  if (!title || !businessImpact || !aiReasoning || !provider || !agent || factors.length === 0) throw new Error("Title, business impact, AI reasoning, target provider, target agent and at least one risk factor are required.");
  const { data: tenant, error: tenantError } = await supabase.from("tenants").select("analytics_settings").eq("id", actor.tenantId).single();
  if (tenantError) throw new Error(`Could not load workspace security settings: ${tenantError.message}`);
  const analyticsSettings = tenant?.analytics_settings && typeof tenant.analytics_settings === "object" ? tenant.analytics_settings as Record<string, unknown> : {};
  const security = analyticsSettings.security && typeof analyticsSettings.security === "object" ? analyticsSettings.security as Record<string, unknown> : {};
  const autoGenerateRollbackPlans = security.autoGenerateRollbackPlans !== false;
  const changeId = `AIG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`; const now = new Date().toISOString(); const ownerTeam = `${provider} Operations`; const tier = input.proposedRiskTier ?? "Medium"; const risk = { tier, score: 0, scoreAvailable: false, factors, source: "proposal" };
  const insert = { tenant_id: actor.tenantId, change_id: changeId, title, stage: "Proposed", severity: tier.toLowerCase(), risk: risk as unknown as Json, execution_mode: "Manual", owner_team: ownerTeam, requester: `Aegis proposal (${actor.userId})`, category: "AI Proposal", agent, change_window: { start: "", end: "", inMaintenance: false }, business_impact: businessImpact, ai_reasoning: aiReasoning, rollback_steps: autoGenerateRollbackPlans ? ["Rollback plan must be defined and approved before any provider mutation."] : [], validations: [{ name: "Proposal gate", status: "warning", detail: autoGenerateRollbackPlans ? "This operation creates intent only; it cannot approve or execute a provider mutation." : "Rollback plan generation is disabled by workspace policy; a rollback plan must be supplied before any provider mutation." }], external_tickets: [], timeline: [{ ts: now, actor: actor.userId, kind: "system", text: `Change proposed for ${provider}.` }] };
  const { data: record, error } = await supabase.from("change_records").insert(insert).select("id,change_id,stage").single(); if (error || !record) throw new Error(error?.message ?? "Could not create the proposed change record.");
  const { error: approvalError } = await supabase.from("change_approvals").insert({ tenant_id: actor.tenantId, change_record_id: record.id, team: ownerTeam, approver: actor.userId, approver_role: "Workspace approver", status: "pending", position: 0 }); if (approvalError) { await supabase.from("change_records").delete().eq("id", record.id).eq("tenant_id", actor.tenantId); throw new Error(approvalError.message); }
  await writeAuditServer(supabase, { tenantId: actor.tenantId, action: "change.proposed", entityType: "change_record", entityId: record.change_id, detail: `${title} — proposed`, payload: { provider, agent, riskFactors: factors, stage: "Proposed", actorRole: actor.actorRole, autoGenerateRollbackPlans } });
  return { id: record.id, changeId: record.change_id, stage: record.stage };
}
