import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAgentDetail } from "@/lib/agent-detail.server";
import { defaultModelGateway } from "@/lib/model-gateway";
import { z } from "zod";
import { resolveTenantContext } from "@/lib/tenant-context.server";
import { getAgentMcpToolAvailability } from "@/lib/mcp/agent-tool-availability.server";

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
  config: Record<string, string | number | boolean | null>;
  steps: GeneratedAgentWorkflowStep[];
  assumptions: string[];
};

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function canonicalProvider(provider: string): string {
  const normalized = provider.trim().toLowerCase();
  return normalized === "m365" ? "microsoft365" : normalized;
}
const GENERATED_MCP_TOOL_ALIASES: Record<string, string> = {
  license_signals: "list_license_signals",
};

function canonicalizeGeneratedMcpStep(
  step: GeneratedAgentWorkflowStep,
  availableMcpToolNames: Set<string>,
): GeneratedAgentWorkflowStep {
  if (!step.provider || !step.capability) return step;

  const provider = canonicalProvider(step.provider);
  if (provider !== "aegis" && provider !== "aegis_mcp") return step;

  let toolName = step.capability;
  if (provider === "aegis") {
    toolName = GENERATED_MCP_TOOL_ALIASES[toolName] ?? toolName;
    if (toolName === "change_management") {
      const mutationLike = /(^|\b)(delete|disable|remove|revoke|modify|update|change|execute|remediate|reclaim|create ticket|write)(\b|$)/i.test(
        `${step.type} ${step.action}`,
      );
      toolName = mutationLike ? "propose_change_record" : "list_change_records";
    }
  }

  if (!availableMcpToolNames.has(toolName)) return step;
  return { ...step, provider: "aegis_mcp", capability: toolName };
}

const generatedWorkflowSchema = z.object({
  summary: z.string().trim().min(1).max(1000),
  trigger: z.string().trim().min(1).max(500),
  config: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  steps: z.array(z.object({
    id: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(120),
    type: z.string().trim().min(1).max(48),
    provider: z.string().trim().max(100).optional(),
    capability: z.string().trim().max(120).optional(),
    action: z.string().trim().min(1).max(1200),
    requiresApproval: z.boolean(),
    verification: z.string().trim().max(600).optional(),
  })).min(1).max(12),
  assumptions: z.array(z.string().trim().max(400)).max(8).default([]),
});

function normalizeWorkflow(raw: unknown): GeneratedAgentWorkflow {
  const parsed = generatedWorkflowSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`The AI returned an invalid workflow schema at ${issue?.path.join(".") || "root"}: ${issue?.message ?? "schema validation failed"}.`);
  }
  const value = parsed.data as Record<string, unknown>;
  const rawSteps = Array.isArray(value.steps) ? value.steps : [];
  const steps: GeneratedAgentWorkflowStep[] = rawSteps.slice(0, 12).map((candidate, index) => {
    const row = candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : {};
    const type = text(row.type, "decision").toLowerCase().slice(0, 48);
    const action = text(row.action, "Evaluate the configured condition.").slice(0, 1200);
    const mutationLike = /(^|\b)(delete|disable|remove|revoke|modify|update|change|execute|remediate|reclaim|create ticket|write)(\b|$)/i.test(`${type} ${action}`);
    const notificationOnly = /(^|\b)(email|notify|notification|alert|slack|teams)(\b|$)/i.test(`${type} ${action}`) && !mutationLike;
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

  if (!steps.length) throw new Error("The AI returned no executable workflow steps. This usually means the request requires a capability that is not enabled for this agent.");
  return {
    summary: text(value.summary, "Generated workflow based on the requested agent behavior.").slice(0, 1000),
    trigger: text(value.trigger, "Run according to the configured schedule or event.").slice(0, 500),
    config: value.config && typeof value.config === "object" && !Array.isArray(value.config) ? value.config as Record<string, string | number | boolean | null> : {},
    steps,
    assumptions: Array.isArray(value.assumptions) ? value.assumptions.map((item) => text(item).slice(0, 400)).filter(Boolean).slice(0, 8) : [],
  };
}

export function findUnavailableRequestedCapabilities(prompt: string, capabilities: Array<{ provider: string; capability: string; name: string; mock: boolean }>): string[] {
  const requested = prompt.toLowerCase();
  const available = capabilities.map((item) => `${item.provider} ${item.capability} ${item.name}`.toLowerCase()).join(" ");
  const unavailable: string[] = [];
  if (/\b(salesforce|sfdc)\b/i.test(requested) && !/\bsalesforce\b|\bsfdc\b/i.test(available)) unavailable.push("Salesforce integration/capability");
  const requestsEmailNotification = /\b(email|e-mail)\b/i.test(requested) && /\b(send|sending|notify|notification|alert)\b/i.test(requested);
  const hasNotificationCapability = capabilities.some((item) => /\b(email|notification|notify|alert|mail)\b/i.test(`${item.provider} ${item.capability} ${item.name}`));
  if (requestsEmailNotification && !hasNotificationCapability) unavailable.push("email/notification capability");
  return unavailable;
}

async function generateWithLovable(messages: Array<{ role: "system" | "user"; content: string }>) {
  const response = await defaultModelGateway.complete({ task: "workflow_planning", messages, temperature: 0.1, json: true });
  return { content: JSON.parse(response.content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()) as unknown, model: response.model };
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
      provider: canonicalProvider(binding.provider ?? "unknown"),
      capability: binding.capabilityKey ?? "unknown",
      name: binding.capabilityName ?? "Unnamed capability",
      mock: binding.isMock,
    }));

    const unavailableCapabilities = findUnavailableRequestedCapabilities(data.prompt, capabilities);
    if (unavailableCapabilities.length) {
      const available = capabilities.length ? capabilities.map((item) => `${item.provider} / ${item.capability}`).join(", ") : "none";
      throw new Error(`This request requires capabilities that are not enabled for ${detail.displayName}: ${unavailableCapabilities.join("; ")}. Available integration capabilities: ${available}. Connect the required integration/capability or revise the request; Aegis will not fabricate unsupported workflow steps.`);
    }
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const mcpAvailability = await getAgentMcpToolAvailability(context.supabase, tenant.tenantId, data.agentKey);
    const mcpTools = mcpAvailability.map((tool) =>
      tool.name + " (" + (tool.available ? (tool.readOnly ? "read" : "approval-gated") : "blocked") + ")" +
      (tool.available ? "" : ": " + (tool.reasons[0] ?? "not authorized"))
    );
    const system = `You are the Aegis Workflow Architect. Convert a customer's natural-language request into a concrete, tenant-safe workflow for one Aegis AI agent. Use ONLY the agent's enabled integrations/capabilities and the available MCP tools supplied below. Never invent a provider capability. For Aegis MCP tools, use provider "aegis_mcp" and set capability to the exact MCP tool name from availableMcpTools (for example list_license_signals, list_change_records, get_change_record, propose_change_record). Do not use shorthand capability names such as aegis/license_signals or aegis/change_management. If the request needs an unavailable capability, represent it as an explicit assumption or explain the limitation in the summary rather than fabricating it. Build an inspectable workflow with trigger -> evidence -> conditions/decision -> action or recommendation -> verification. The workflow is a DRAFT: never claim that an external action has already happened. Keep write/mutation/remediation actions approval-gated. Notifications such as email/alert can be ungated when they are only informational and an actual notification capability is available. Return JSON only with exactly these fields: summary (string), trigger (string), config (object), steps (array), assumptions (string array). Each step must have id, name, type, provider, capability, action, requiresApproval, and optional verification. Keep the workflow practical and executable by Aegis's existing capability/MCP layer. Do not output code.`;
    const user = JSON.stringify({
      agent: { key: detail.agentKey, name: detail.displayName, category: detail.category, description: detail.description },
      enabledCapabilities: capabilities,
      availableMcpTools: mcpTools,
      existingWorkflow: detail.workflow,
      customerRequest: data.prompt,
    });
    const generated = await generateWithLovable([{ role: "system", content: system }, { role: "user", content: user }]);
    const workflow = normalizeWorkflow(generated.content);
    const allowed = new Set(capabilities.map((item) => `${item.provider}:${item.capability}`));
    const availableMcpTools = mcpAvailability.filter((tool) => tool.available);
    const allowedMcpToolNames = new Set(availableMcpTools.map((tool) => tool.name));
    workflow.steps = workflow.steps.map((step) => canonicalizeGeneratedMcpStep(step, allowedMcpToolNames));
    const unsafe = workflow.steps.filter((step) => {
      if (!step.provider || !step.capability) return false;
      const provider = canonicalProvider(step.provider);
      const capabilityRef = `${provider}:${step.capability}`;
      const isAuthorizedAegisMcpTool = provider === "aegis_mcp" && allowedMcpToolNames.has(step.capability);
      return !allowed.has(capabilityRef) && !isAuthorizedAegisMcpTool;
    });
    if (unsafe.length) throw new Error(`The generated workflow referenced capability bindings that are not enabled for this agent: ${unsafe.map((step) => `${step.provider}/${step.capability}`).join(", ")}.`);
    return { ok: true as const, model: generated.model, ...workflow };
  });
