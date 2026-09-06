import type { SupabaseClient } from "@supabase/supabase-js";

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

const jsonSafe = (value: unknown, maxChars = 12000) => {
  try {
    const text = JSON.stringify(value ?? null);
    return JSON.parse(text.length > maxChars ? `${text.slice(0, maxChars)}…` : text);
  } catch {
    return { value: String(value).slice(0, maxChars) };
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
    finding: step.finding ?? null,
    status: step.status ?? "completed",
    latency_ms: step.latencyMs ?? null,
    error_message: step.errorMessage ?? null,
    completed_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Could not record investigation step: ${error.message}`);
}

export async function recordToolInvocation(
  db: SupabaseClient,
  context: { tenantId: string; investigationId?: string; conversationId?: string | null; interactionId?: string | null; userId?: string },
  tool: { provider?: string; serverName?: string; toolName: string; arguments?: unknown; result?: unknown; status: "success" | "failed"; startedAt: number; errorMessage?: string },
) {
  const client = db as any;
  const completedAt = Date.now();
  const { data, error } = await client.from("tool_invocations").insert({
    tenant_id: context.tenantId,
    investigation_id: context.investigationId ?? null,
    conversation_id: context.conversationId ?? null,
    interaction_id: context.interactionId ?? null,
    agent_run_id: context.userId ?? null,
    provider: tool.provider ?? null,
    server_name: tool.serverName ?? null,
    tool_name: tool.toolName,
    arguments: jsonSafe(tool.arguments),
    result: tool.result === undefined ? null : jsonSafe(tool.result),
    status: tool.status,
    started_at: new Date(tool.startedAt).toISOString(),
    completed_at: new Date(completedAt).toISOString(),
    latency_ms: completedAt - tool.startedAt,
    error_message: tool.errorMessage ?? null,
    authorization: { tenantScoped: true, userId: context.userId ?? null },
  }).select("id").single();
  if (error) throw new Error(`Could not record tool invocation: ${error.message}`);
  return data.id as string;
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
    await client.from("customer_resolutions").insert({
      tenant_id: tenantId,
      investigation_id: investigationId,
      channel: result.channel,
      response_text: result.responseText,
      resolution_type: result.status,
      evidence_summary: jsonSafe(result.evidenceSummary ?? []),
      verified: result.verification ?? false,
    });
  }
}
