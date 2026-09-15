import { defaultModelGateway, type ModelGateway, type ModelGatewayError, type ModelRequest, type ModelResponse, type ModelUsage } from "@/lib/model-gateway";

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

export async function writeAiUsageEvent(
  context: AiUsageContext,
  usage: ModelUsage | undefined,
  model: string,
  startedAt: number,
): Promise<void> {
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

export async function completeWithAiUsageTracking(
  context: AiUsageContext,
  request: ModelRequest,
  gateway: ModelGateway = defaultModelGateway,
): Promise<ModelResponse> {
  const startedAt = Date.now();
  try {
    const response = await gateway.complete(request);
    await writeAiUsageEvent(context, response.usage, response.model, startedAt);
    return response;
  } catch (error) {
    const candidate = error as Partial<ModelGatewayError>;
    if (candidate.usage && candidate.model) {
      await writeAiUsageEvent(context, candidate.usage, candidate.model, startedAt);
    }
    throw error;
  }
}
