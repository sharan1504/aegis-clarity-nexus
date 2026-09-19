import { getRequest } from "@tanstack/react-start/server";
import type { JsonValue } from "@/lib/json";
import type { AgentRunState } from "@/lib/agent-runtime";
import { transitionAgentRun } from "@/lib/agent-runtime";
import { MCP_TOOL_REGISTRY } from "@/lib/mcp/gateway-catalog";
import { requireAgentBudget, withAgentRetry } from "@/lib/agent-execution-controller.server";

function requestToken(): string {
  const header = getRequest()?.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("Authenticated request token is unavailable.");
  return header.slice("Bearer ".length).trim();
}

const TOOL_BY_AGENT: Record<string, string[]> = {
  "agent-security": ["list_incidents_and_alerts", "get_operations_overview", "list_reports_and_recommendations"],
  "agent-incident": ["list_incidents_and_alerts", "get_operations_overview", "list_change_records"],
  "agent-cloud": ["get_operations_overview", "list_reports_and_recommendations", "list_integrations"],
  "agent-routing": ["get_operations_overview", "list_incidents_and_alerts", "list_reports_and_recommendations"],
  "agent-license": ["list_integrations", "list_reports_and_recommendations", "get_operations_overview"],
  "agent-knowledge": ["list_integrations", "list_agents", "list_reports_and_recommendations"],
  "agent-workflow": ["list_change_records", "get_operations_overview", "list_integrations"],
};

function selectedTools(agentKey: string): string[] {
  return TOOL_BY_AGENT[agentKey] ?? ["get_operations_overview", "list_integrations", "list_reports_and_recommendations"];
}

export async function orchestrateGenericReadOnlyRun(supabase: any, userId: string, run: AgentRunState): Promise<{ run: AgentRunState; evidence: JsonValue[]; warnings: string[] }> {
  const evidence: JsonValue[] = [];
  const warnings: string[] = [];
  const token = requestToken();
  let next = run;
  const runId = run.runId.replace(/^run-/, "");

  if (next.status === "planned") {
    await requireAgentBudget(supabase, run.tenantId, runId, "step");
    next = transitionAgentRun(next, { type: "start" });
  }

  await requireAgentBudget(supabase, run.tenantId, runId, "step");
  next = transitionAgentRun(next, { type: "complete_step", step: "plan", value: { agentKey: run.agentKey, executionClass: "read_only", orchestration: "bounded-supervisor", tools: selectedTools(run.agentKey) } });

  for (const toolName of selectedTools(run.agentKey).slice(0, 3)) {
    await requireAgentBudget(supabase, run.tenantId, runId, "tool");
    try {
      const result = await withAgentRetry(supabase, run.tenantId, runId, () => MCP_TOOL_REGISTRY.invoke(toolName, {}, { isAuthenticated: () => true, token, userId }) as Promise<any>);
      if ((result as { isError?: boolean })?.isError) warnings.push(toolName + " returned an error.");
      else evidence.push({ source: "mcp", tool: toolName, observedAt: new Date().toISOString(), result } as JsonValue);
    } catch (error) {
      warnings.push(toolName + ": " + (error instanceof Error ? error.message : "tool invocation failed"));
    }
  }

  await requireAgentBudget(supabase, run.tenantId, runId, "step");
  next = transitionAgentRun(next, { type: "complete_step", step: "investigate", value: { toolCount: evidence.length, warnings } });
  await requireAgentBudget(supabase, run.tenantId, runId, "step");
  next = transitionAgentRun(next, { type: "complete_step", step: "policy", value: { decision: "allow", executionClass: "read_only", approvalRequired: false, evidenceBacked: evidence.length > 0, warnings } });
  await requireAgentBudget(supabase, run.tenantId, runId, "step");
  next = transitionAgentRun(next, { type: "complete_step", step: "approval", value: { status: "not_required", reason: "Read-only investigation; no provider mutation requested." } });
  await requireAgentBudget(supabase, run.tenantId, runId, "step");
  next = transitionAgentRun(next, { type: "complete_step", step: "execute", value: { executed: false, mutations: false, mode: "read_only", evidenceSources: evidence.length } });
  await requireAgentBudget(supabase, run.tenantId, runId, "step");
  next = transitionAgentRun(next, { type: "complete_step", step: "verify", value: { verification: "read-only evidence collection completed", evidenceSources: evidence.length, warnings } });
  return { run: next, evidence, warnings };
}