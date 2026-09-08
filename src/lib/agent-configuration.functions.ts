import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireManage, resolveTenant, bindingErrorPayload } from "./capabilities/bindings.server";
import { DEFAULT_AGENT_POLICY_RULES, parseAgentPolicyRules, type AgentPolicyRule } from "./capabilities/agent-policy-rules";

export interface AgentConfigurationSettings { purposeBehavior: string; policyRules: AgentPolicyRule[]; }
const DEFAULT_PURPOSE = "Optimize software license usage by identifying eligible unused entitlements, producing evidence-backed recommendations, requiring governance approval for production changes, and verifying outcomes after execution.";

export const getAgentConfiguration = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { agentKey: string }) => ({ agentKey: String(input.agentKey ?? "") })).handler(async ({ data, context }) => {
  try {
    const tenant = await resolveTenant(context.supabase, context.userId);
    const db = context.supabase as any;
    const { data: row, error } = await db.from("agent_settings").select("purpose_behavior, policy_rules").eq("tenant_id", tenant.tenantId).eq("agent_key", data.agentKey).maybeSingle();
    if (error) throw error;
    const parsed = parseAgentPolicyRules(row?.policy_rules ?? DEFAULT_AGENT_POLICY_RULES);
    const policyRules = Array.isArray(parsed) && (parsed.length === 0 || "id" in parsed[0]) ? parsed as AgentPolicyRule[] : DEFAULT_AGENT_POLICY_RULES;
    return { ok: true as const, canManage: tenant.canManage, settings: { purposeBehavior: row?.purpose_behavior || DEFAULT_PURPOSE, policyRules } };
  } catch (error) { return { ...bindingErrorPayload(error), canManage: false, settings: { purposeBehavior: DEFAULT_PURPOSE, policyRules: DEFAULT_AGENT_POLICY_RULES } }; }
});

export const saveAgentConfiguration = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { agentKey: string; purposeBehavior: string; policyRules: unknown }) => ({ agentKey: String(input.agentKey ?? ""), purposeBehavior: String(input.purposeBehavior ?? "").slice(0, 8000), policyRules: input.policyRules as unknown })).handler(async ({ data, context }) => {
  try {
    const tenant = await requireManage(context.supabase, context.userId);
    const parsed = parseAgentPolicyRules(data.policyRules);
    if (!Array.isArray(parsed) || (parsed.length > 0 && !("id" in parsed[0]))) { const issue = (parsed as Array<{ message?: string }>)[0]; throw new Error(issue?.message ?? "Invalid policy rules."); }
    const db = context.supabase as any;
    const { error } = await db.from("agent_settings").upsert({ tenant_id: tenant.tenantId, agent_key: data.agentKey, purpose_behavior: data.purposeBehavior, policy_rules: parsed, updated_by: context.userId }, { onConflict: "tenant_id,agent_key" });
    if (error) throw error;
    return { ok: true as const };
  } catch (error) { return bindingErrorPayload(error); }
});
