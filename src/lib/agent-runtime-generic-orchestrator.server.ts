import { getRequest } from "@tanstack/react-start/server";
import type { JsonValue } from "@/lib/json";
import type { AgentRunState } from "@/lib/agent-runtime";
import { transitionAgentRun } from "@/lib/agent-runtime";
import { MCP_TOOL_REGISTRY } from "@/lib/mcp/gateway-catalog";
import { getAgentMcpToolAvailability } from "@/lib/mcp/agent-tool-availability.server";
import { invokeDynamicMcpTool } from "@/lib/mcp/dynamic-invoker.server";
import { runGovernedWithToken } from "@/lib/execution/gateway.server";
import { getAgentPlaybook } from "@/lib/agents/playbooks";
import { requireAgentBudget, withAgentRetry } from "@/lib/agent-execution-controller.server";

function requestToken(): string {
  const header = getRequest()?.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("Authenticated request token is unavailable.");
  return header.slice("Bearer ".length).trim();
}

function selectPlaybookTools(playbook: ReturnType<typeof getAgentPlaybook>, availability: Awaited<ReturnType<typeof getAgentMcpToolAvailability>>) {
  const selected: Array<{ stepId: string; stepName: string; tool: (typeof availability)[number] }> = [];
  const seen = new Set<string>();
  for (const step of playbook.investigationPlaybook) {
    for (const capability of step.capabilities) {
      const matches = availability.filter((tool) => tool.available && tool.capability === capability);
      if (!matches.length) continue;
      for (const tool of matches.slice(0, step.maxTools ?? 4)) {
        if (seen.has(tool.name)) continue;
        seen.add(tool.name);
        selected.push({ stepId: step.id, stepName: step.name, tool });
      }
    }
  }
  return selected;
}

export async function orchestrateGenericReadOnlyRun(supabase: any, userId: string, run: AgentRunState): Promise<{ run: AgentRunState; evidence: JsonValue[]; warnings: string[] }> {
  const evidence: JsonValue[] = [];
  const warnings: string[] = [];
  const token = requestToken();
  const playbook = getAgentPlaybook(run.agentKey);
  const availability = await getAgentMcpToolAvailability(supabase, run.tenantId, run.agentKey);
  const selected = selectPlaybookTools(playbook, availability);
  const selectedCapabilities = new Set(selected.map((item) => item.tool.capability).filter(Boolean));

  for (const capability of [...playbook.requiredCapabilities, ...playbook.optionalCapabilities]) {
    if (!selectedCapabilities.has(capability)) {
      warnings.push(`Data gap: no authorized live tool is available for ${capability}.`);
    }
  }

  let next = run;
  const runId = run.runId.replace(/^run-/, "");

  if (next.status === "planned") {
    await requireAgentBudget(supabase, run.tenantId, runId, "step");
    next = transitionAgentRun(next, { type: "start" });
  }

  await requireAgentBudget(supabase, run.tenantId, runId, "step");
  next = transitionAgentRun(next, {
    type: "complete_step",
    step: "plan",
    value: {
      agentKey: run.agentKey,
      mission: playbook.mission,
      requiredCapabilities: playbook.requiredCapabilities,
      optionalCapabilities: playbook.optionalCapabilities,
      executionClass: "read_only",
      orchestration: "domain-playbook",
      selectedTools: selected.map((item) => ({
        step: item.stepId,
        name: item.tool.name,
        capability: item.tool.capability,
        provider: item.tool.provider,
      })),
      outputContract: playbook.outputContract,
    },
  });

  for (const item of selected) {
    await requireAgentBudget(supabase, run.tenantId, runId, "tool");
    try {
      const invoke = async () => {
        const ctx = { isAuthenticated: () => true, token, userId };
        if (item.tool.origin !== "builtin") {
          const governed = await runGovernedWithToken(token, userId, {
            origin: "mcp",
            actionKey: item.tool.actionKey,
            executionClass: item.tool.executionClass,
            capability: item.tool.capability,
            provider: item.tool.provider,
          }, () => invokeDynamicMcpTool(supabase, run.tenantId, item.tool, run.input ?? {}));
          if (!governed.ok) throw new Error(governed.reasons.join(" "));
          return governed.result;
        }
        return MCP_TOOL_REGISTRY.invoke(item.tool.name, run.input ?? {}, ctx);
      };
      const result = await withAgentRetry(supabase, run.tenantId, runId, invoke);
      if ((result as { isError?: boolean })?.isError) {
        warnings.push(item.tool.name + " returned an error.");
      } else {
        evidence.push({
          source: "mcp",
          playbookStep: item.stepId,
          playbookStepName: item.stepName,
          tool: item.tool.name,
          capability: item.tool.capability,
          provider: item.tool.provider,
          observedAt: new Date().toISOString(),
          result,
        } as JsonValue);
      }
    } catch (error) {
      warnings.push(item.tool.name + ": " + (error instanceof Error ? error.message : "tool invocation failed"));
    }
  }

  await requireAgentBudget(supabase, run.tenantId, runId, "step");
  next = transitionAgentRun(next, {
    type: "complete_step",
    step: "investigate",
    value: {
      playbook: playbook.investigationPlaybook.map((step) => ({ id: step.id, name: step.name })),
      toolCount: evidence.length,
      warnings,
      dataGaps: warnings.filter((warning) => warning.startsWith("Data gap:")),
    },
  });
  await requireAgentBudget(supabase, run.tenantId, runId, "step");
  next = transitionAgentRun(next, {
    type: "complete_step",
    step: "policy",
    value: {
      decision: "allow",
      executionClass: playbook.remediation,
      approvalRequired: playbook.remediation !== "read_only",
      evidenceBacked: evidence.length > 0,
      warnings,
    },
  });
  await requireAgentBudget(supabase, run.tenantId, runId, "step");
  next = transitionAgentRun(next, {
    type: "complete_step",
    step: "approval",
    value: {
      status: playbook.remediation === "approval_gated" ? "required_for_mutation" : "not_required",
      reason: playbook.remediation === "approval_gated" ? "Any consequential workflow action remains approval-gated." : "Read-only investigation; no provider mutation requested.",
    },
  });
  await requireAgentBudget(supabase, run.tenantId, runId, "step");
  next = transitionAgentRun(next, {
    type: "complete_step",
    step: "execute",
    value: { executed: false, mutations: false, mode: "read_only", evidenceSources: evidence.length },
  });
  await requireAgentBudget(supabase, run.tenantId, runId, "step");
  next = transitionAgentRun(next, {
    type: "complete_step",
    step: "verify",
    value: {
      verification: "read-only evidence collection completed",
      evidenceSources: evidence.length,
      dataGaps: warnings.filter((warning) => warning.startsWith("Data gap:")),
      warnings,
    },
  });
  return { run: next, evidence, warnings };
}
