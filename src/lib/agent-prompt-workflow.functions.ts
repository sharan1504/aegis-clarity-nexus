import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAgentDetail } from "@/lib/agent-detail.server";

const ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

export type GeneratedAgentWorkflowStep = {
  id: string;
  name: string;
  type: string;
  provider?: string;
  capability?: string;
  action: string;
  requiresApproval: boolean;
  verification?: string;
};

export type GeneratedAgentWorkflow = {
  summary: string;
  trigger: string;
  config: Record<string, unknown>;
  steps: GeneratedAgentWorkflowStep[];
  assumptions: string[];
};

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeWorkflow(raw: unknown): GeneratedAgentWorkflow {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const rawSteps = Array.isArray(value.steps) ? value.steps : [];
  const steps: GeneratedAgentWorkflowStep[] = rawSteps.slice(0, 12).map((candidate, index) => {
    const row = candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : {};
    const type = text(row.type, "decision").toLowerCase().slice(0, 48);
    const action = text(row.action, "Evaluate the configured condition.").slice(0, 1200);
    const mutationLike = /(^|\\b)(delete|disable|remove|revoke|modify|update|change|execute|remediate|reclaim|create ticket|write)(\\b|$)/i.test(`${type} ${action}`);
    const notificationOnly = /(^|\\b)(email|notify|notification|alert|slack|teams)(\\b|$)/i.test(`${type} ${action}`) && !mutationLike;
    return {
      id: text(row.id, `generated-${index + 1}`),
      name: text(row.name, `Workflow step ${index + 1}`).slice(0, 120),
      type,
      provider: text(row.provider).slice(0, 100) || undefined,
      capability: text(row.capability).slice(0, 120) || undefined,
      action,
      requiresApproval: mutationLike || (!notificationOnly && Boolean(row.requiresApproval)),
      verification: text(row.verification).slice(0, 600) || undefined,
    };
  });

  if (!steps.length) throw new Error("The AI could not produce a usable workflow. Please make the requested behavior more specific.");
  return {
    summary: text(value.summary, "Generated workflow based on the requested agent behavior.").slice(0, 1000),
    trigger: text(value.trigger, "Run according to the configured schedule or event.").slice(0, 500),
    config: value.config && typeof value.config === "object" && !Array.isArray(value.config) ? value.config as Record<string, unknown> : {},
    steps,
    assumptions: Array.isArray(value.assumptions) ? value.assumptions.map((item) => text(item).slice(0, 400)).filter(Boolean).slice(0, 8) : [],
  };
}

async function generateWithLovable(messages: Array<{ role: "system" | "user"; content: string }>) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Lovable AI is not configured for this workspace.");
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.1, response_format: { type: "json_object" } }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`AI workflow generation failed (${response.status}).`);
  const parsed = JSON.parse(body) as { choices?: Array<{ message?: { content?: string } }> };
  const content = parsed.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI returned an empty workflow.");
  const cleaned = content.replace(/^```(?:json)?\\s*/i, "").replace(/\\s*```$/i, "").trim();
  return JSON.parse(cleaned) as unknown;
}

export const generateAgentWorkflowFromPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentKey: string; prompt: string }) => {
    const agentKey = String(input?.agentKey ?? "").trim();
    const prompt = String(input?.prompt ?? "").trim();
    if (!agentKey) throw new Error("An agent key is required.");
    if (!prompt) throw new Error("Describe what you want this agent to automate.");
    if (prompt.length > 6000) throw new Error("Keep the automation request under 6,000 characters.");
    return { agentKey, prompt };
  })
  .handler(async ({ data, context }) => {
    const detail = await loadAgentDetail(context.supabase, context.userId, data.agentKey);
    if (!detail) throw new Error("Agent not found.");
    const capabilities = detail.bindings.filter((binding) => binding.enabled).map((binding) => ({
      provider: binding.provider,
      capability: binding.capabilityKey,
      name: binding.capabilityName,
      mock: binding.isMock,
    }));
    const mcpTools = [
      "get_operations_overview (read)",
      "list_agents (read)",
      "list_integrations (read)",
      "list_incidents_and_alerts (read)",
      "list_reports_and_recommendations (read)",
      "list_change_records (read)",
      "get_change_record (read)",
      "propose_change_record (write: creates a governed Proposed change; never executes it)",
    ];
    const system = `You are the Aegis Workflow Architect. Convert a customer's natural-language request into a concrete, tenant-safe workflow for one Aegis AI agent. Use ONLY the agent's enabled integrations/capabilities and the available MCP tools supplied below. Never invent a provider capability. If the request needs an unavailable capability, represent it as an explicit assumption or explain the limitation in the summary rather than fabricating it. Build an inspectable workflow with trigger -> evidence -> conditions/decision -> action or recommendation -> verification. The workflow is a DRAFT: never claim that an external action has already happened. Keep write/mutation/remediation actions approval-gated. Notifications such as email/alert can be ungated when they are only informational. Return JSON only with exactly these fields: summary (string), trigger (string), config (object), steps (array), assumptions (string array). Each step must have id, name, type, provider, capability, action, requiresApproval, and optional verification. Keep the workflow practical and executable by Aegis's existing capability/MCP layer. Do not output code. MODEL: ${MODEL}`;
    const user = JSON.stringify({
      agent: { key: detail.agentKey, name: detail.displayName, category: detail.category, description: detail.description },
      enabledCapabilities: capabilities,
      availableMcpTools: mcpTools,
      existingWorkflow: detail.workflow,
      customerRequest: data.prompt,
    });
    const generated = normalizeWorkflow(await generateWithLovable([{ role: "system", content: system }, { role: "user", content: user }]));
    return { ok: true as const, model: MODEL, ...generated };
  });
