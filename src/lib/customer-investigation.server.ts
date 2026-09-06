import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeOutput } from "@/lib/guardrails/sanitize";

export type InvestigationChannel = "voice" | "chat" | "messaging" | "whatsapp" | "email" | "bot" | "api" | "unknown";

type InvestigationContext = {
  tenantId: string;
  userId?: string;
  customerId?: string | null;
  conversationId?: string | null;
  interactionId?: string | null;
  channel: InvestigationChannel;
  subject?: string | null;
};

type ToolContext = {
  tenantId: string;
  investigationId?: string;
  conversationId?: string | null;
  interactionId?: string | null;
  userId?: string;
};

type ToolDescriptor = {
  provider?: string;
  serverName?: string;
  toolName: string;
  arguments?: unknown;
};

const jsonSafe = (value: unknown, maxChars = 12000) => {
  const sanitized = sanitizeOutput(value);
  try {
    const text = JSON.stringify(sanitized ?? null);
    if (text.length <= maxChars) return JSON.parse(text);
    return { truncated: true, value: text.slice(0, maxChars) };
  } catch {
    return { value: String(sanitized).slice(0, maxChars) };
  }
};

export async function startCustomerInvestigation(db: SupabaseClient, context: InvestigationContext) {
  const client = db as any;
  const { data, error } = await client.from("customer_investigations").insert({
    tenant_id: context.tenantId,
    customer_id: context.customerId ?? null,
    conversation_id: context.conversationId ?? null,
    interaction_id: context.interactionId ?? null,
    channel: context.channel,
    subject: context.subject ?? null,
    created_by: context.userId ?? null,
    status: "running",
  }).select("id").single();
  if (error) throw new Error(`Could not start investigation: ${error.message}`);
  return data.id as string;
}

export async function recordInvestigationStep(
  db: SupabaseClient,
  investigationId: string,
  tenantId: string,
  step: {
    stepNumber: number;
    stepType: "intent" | "tool_call" | "evidence" | "finding" | "decision" | "action" | "verification" | "response";
    name: string;
    provider?: string;
    toolName?: string;
    toolServer?: string;
    input?: unknown;
    output?: unknown;
    evidence?: unknown;
    finding?: string;
    status?: "running" | "completed" | "failed" | "skipped";
    latencyMs?: number;
    errorMessage?: string;
  },
) {
  const client = db as any;
  const { error } = await client.from("investigation_steps").insert({
    tenant_id: tenantId,
    investigation_id: investigationId,
    step_number: step.stepNumber,
    step_type: step.stepType,
    name: step.name,
    provider: step.provider ?? null,
    tool_name: step.toolName ?? null,
    tool_server: step.toolServer ?? null,
    input: step.input === undefined ? null : jsonSafe(step.input),
    output: step.output === undefined ? null : jsonSafe(step.output),
    evidence: step.evidence === undefined ? null : jsonSafe(step.evidence),
    finding: step.finding ? String(step.finding).slice(0, 4000) : null,
    status: step.status ?? "completed",
    latency_ms: step.latencyMs ?? null,
    error_message: step.errorMessage ? String(step.errorMessage).slice(0, 2000) : null,
    completed_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Could not record investigation step: ${error.message}`);
}

export async function recordToolInvocation(
  db: SupabaseClient,
  context: ToolContext,
  tool: ToolDescriptor & { result?: unknown; status: "success" | "failed"; startedAt: number; completedAt?: number; errorMessage?: string },
) {
  const client = db as any;
  const completedAt = tool.completedAt ?? Date.now();
  const { data, error } = await client.from("tool_invocations").insert({
    tenant_id: context.tenantId,
    investigation_id: context.investigationId ?? null,
    conversation_id: context.conversationId ?? null,
    interaction_id: context.interactionId ?? null,
    agent_run_id: null,
    provider: tool.provider ?? null,
    server_name: tool.serverName ?? null,
    tool_name: tool.toolName,
    arguments: jsonSafe(tool.arguments),
    result: tool.result === undefined ? null : jsonSafe(tool.result),
    status: tool.status,
    started_at: new Date(tool.startedAt).toISOString(),
    completed_at: new Date(completedAt).toISOString(),
    latency_ms: Math.max(0, completedAt - tool.startedAt),
    error_message: tool.errorMessage ? String(tool.errorMessage).slice(0, 2000) : null,
    authorization: { tenantScoped: true, userId: context.userId ?? null },
  }).select("id").single();
  if (error) throw new Error(`Could not record tool invocation: ${error.message}`);
  return data.id as string;
}

/** Executes a tool and records both successful and failed calls without changing the tool's return value. */
export async function runRecordedTool<T>(
  db: SupabaseClient,
  context: ToolContext,
  tool: ToolDescriptor,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await operation();
    await recordToolInvocation(db, context, { ...tool, result, status: "success", startedAt });
    return result;
  } catch (error) {
    try {
      await recordToolInvocation(db, context, { ...tool, status: "failed", startedAt, errorMessage: error instanceof Error ? error.message : String(error) });
    } catch (recordingError) {
      console.error("[customer-investigation] failed to record tool error", recordingError);
    }
    throw error;
  }
}

export async function completeCustomerInvestigation(
  db: SupabaseClient,
  investigationId: string,
  tenantId: string,
  result: { status: "resolved" | "failed" | "needs_human"; intent?: string; resolution?: string; confidence?: number; channel: InvestigationChannel; responseText?: string; evidenceSummary?: unknown; verification?: boolean },
) {
  const client = db as any;
  const now = new Date().toISOString();
  const { error } = await client.from("customer_investigations").update({
    status: result.status,
    intent: result.intent ?? null,
    resolution: result.resolution ?? null,
    confidence: result.confidence ?? null,
    completed_at: now,
  }).eq("id", investigationId).eq("tenant_id", tenantId);
  if (error) throw new Error(`Could not complete investigation: ${error.message}`);

  if (result.responseText) {
    const { error: resolutionError } = await client.from("customer_resolutions").insert({
      tenant_id: tenantId,
      investigation_id: investigationId,
      channel: result.channel,
      response_text: result.responseText,
      resolution_type: result.status,
      evidence_summary: jsonSafe(result.evidenceSummary ?? []),
      verified: result.verification ?? false,
    });
    if (resolutionError) throw new Error(`Could not record customer resolution: ${resolutionError.message}`);
  }
}
