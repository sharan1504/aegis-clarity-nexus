import type { ModelRequest, ModelUsage } from "@/lib/model-gateway";

export interface AiUsageContext {
  tenantId: string;
  userId: string;
  agentKey: string;
  provider: string;
}

function finite(value: number | undefined): number {
  return Number.isFinite(value) && value !== undefined ? Math.max(0, Math.round(value)) : 0;
}

function estimateCost(model: string, usage: ModelUsage | undefined): number {
  const input = finite(usage?.inputTokens);
  const output = finite(usage?.outputTokens);
  const configured = process.env.CENOPS_MODEL_PRICING_JSON;
  if (!configured) return 0;

  try {
    const pricing = JSON.parse(configured) as Record<string, { inputPerMillion?: number; outputPerMillion?: number }>;
    const rates = pricing[model];
    if (!rates) return 0;
    const inputRate = Number(rates.inputPerMillion ?? 0);
    const outputRate = Number(rates.outputPerMillion ?? 0);
    if (!Number.isFinite(inputRate) || !Number.isFinite(outputRate)) return 0;
    return Number(((input / 1_000_000) * inputRate + (output / 1_000_000) * outputRate).toFixed(8));
  } catch {
    return 0;
  }
}

function usageContextForRequest(request: ModelRequest, tenantId: string, userId: string): AiUsageContext {
  const systemText = request.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n");
  if (request.task === "workflow_planning") return { tenantId, userId, agentKey: "agent-workflow", provider: "agent-workflow" };
  if (/Aegis License Agent/i.test(systemText)) return { tenantId, userId, agentKey: "agent-license", provider: "license-agent" };
  if (/CenOps Enterprise AI/i.test(systemText)) return { tenantId, userId, agentKey: "cenops-copilot", provider: "cenops-copilot" };
  return { tenantId, userId, agentKey: `model-${request.task}`, provider: `model-${request.task}` };
}

async function resolveRequestTenant(): Promise<{ tenantId: string; userId: string } | null> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const authorization = request?.headers.get("authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return null;
    const token = authorization.slice("Bearer ".length).trim();
    const payload = token.split(".")[1];
    if (!payload) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData.user?.id) return null;
    const userId = authData.user.id;

    const { data: profile } = await (supabaseAdmin as any).from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
    const tenantId = profile?.tenant_id;
    return typeof tenantId === "string" && tenantId ? { tenantId, userId } : null;
  } catch (error) {
    console.error("[ai-usage] could not resolve request tenant", error);
    return null;
  }
}

export async function writeAiUsageEvent(
  request: ModelRequest,
  usage: ModelUsage | undefined,
  model: string,
  startedAt: number,
): Promise<void> {
  const resolved = await resolveRequestTenant();
  if (!resolved) return;
  const context = usageContextForRequest(request, resolved.tenantId, resolved.userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const inputTokens = finite(usage?.inputTokens);
  const outputTokens = finite(usage?.outputTokens);
  const totalTokens = finite(usage?.totalTokens) || inputTokens + outputTokens;
  const { error } = await (supabaseAdmin as any).from("ai_usage_events").insert({
    tenant_id: context.tenantId,
    user_id: context.userId,
    agent_key: context.agentKey,
    provider: context.provider,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    cost_estimate: estimateCost(model, usage),
    latency_ms: Math.max(0, Date.now() - startedAt),
  });
  if (error) console.error("[ai-usage] failed to write usage event", error);
}
