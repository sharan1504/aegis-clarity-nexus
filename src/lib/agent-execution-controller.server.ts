import type { UserClient } from "@/lib/execution/gateway.server";

export type AgentBudgetKind = "step" | "tool" | "retry" | "model";

export interface AgentBudgetClaim {
  allowed: boolean;
  reason?: string;
  stepCount?: number;
  toolCallCount?: number;
  retryCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export async function claimAgentBudget(
  supabase: UserClient,
  tenantId: string,
  runId: string,
  kind: AgentBudgetKind,
  usage: { inputTokens?: number; outputTokens?: number; costUsd?: number } = {},
): Promise<AgentBudgetClaim> {
  const { data, error } = await (supabase as any).rpc("claim_agent_budget", {
    p_run_id: runId,
    p_tenant_id: tenantId,
    p_kind: kind,
    p_input_tokens: Math.max(0, Math.round(usage.inputTokens ?? 0)),
    p_output_tokens: Math.max(0, Math.round(usage.outputTokens ?? 0)),
    p_cost_usd: Math.max(0, Number(usage.costUsd ?? 0)),
  });
  if (error) throw new Error(`Unable to claim agent budget: ${error.message}`);
  return data as AgentBudgetClaim;
}

export async function requireAgentBudget(
  supabase: UserClient,
  tenantId: string,
  runId: string,
  kind: AgentBudgetKind,
  usage: { inputTokens?: number; outputTokens?: number; costUsd?: number } = {},
): Promise<AgentBudgetClaim> {
  const claim = await claimAgentBudget(supabase, tenantId, runId, kind, usage);
  if (!claim.allowed) throw new Error(claim.reason ?? "Agent runtime budget denied.");
  return claim;
}

export async function checkpointAgentRun(
  supabase: UserClient,
  tenantId: string,
  runId: string,
  checkpoint: unknown,
): Promise<void> {
  const { error } = await (supabase as any)
    .from("agent_runs")
    .update({ checkpoint, checkpointed_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`Unable to persist agent checkpoint: ${error.message}`);
}

export function sanitizeTracePayload(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
      .replace(/(access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|password)\s*[:=]\s*["']?[^,"'\s}]+/gi, "$1=[REDACTED]")
      .slice(0, 4000);
  }
  if (Array.isArray(value)) return value.slice(0, 50).map(sanitizeTracePayload);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (/token|secret|password|authorization|credential|api.?key/i.test(key)) out[key] = "[REDACTED]";
      else out[key] = sanitizeTracePayload(child);
    }
    return out;
  }
  return value;
}


export function isRetryableAgentError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(429|502|503|504|timeout|timed out|temporar|rate limit|network)\b/i.test(message);
}

export async function withAgentRetry<T>(
  supabase: UserClient,
  tenantId: string,
  runId: string,
  operation: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 2, 3));
  const baseDelayMs = Math.max(50, Math.min(options.baseDelayMs ?? 250, 2000));
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableAgentError(error)) throw error;
      await requireAgentBudget(supabase, tenantId, runId, "retry");
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Agent operation failed after retries.");
}
