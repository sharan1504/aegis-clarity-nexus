import { getRequest } from "@tanstack/react-start/server";
import { toJsonValue } from "@/lib/json";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { githubCapabilityRouter } from "@/lib/capabilities/github-router.server";
import { analyzeSecurityFindings } from "@/lib/agents/security/analysis";
import { SECURITY_AGENT_KEY } from "@/lib/agents/security/types";
import { createProposedChangeRecord } from "@/lib/change-proposal.server";
import { getAgentMcpToolAvailability } from "@/lib/mcp/agent-tool-availability.server";
import { invokeDynamicMcpTool } from "@/lib/mcp/dynamic-invoker.server";
import { runGovernedWithToken } from "@/lib/execution/gateway.server";
import { orchestrateAgentRun } from "./agent-runtime-orchestrator";
import type { AgentRunState } from "./agent-runtime";

type UserClient = SupabaseClient<Database>;

function riskTier(recommendations: Array<{ severity: string }>): "Medium" | "High" | "Critical" {
  if (recommendations.some((recommendation) => recommendation.severity === "critical")) return "Critical";
  if (recommendations.some((recommendation) => recommendation.severity === "high")) return "High";
  return "Medium";
}

export async function orchestrateSecurityRun(supabase: UserClient, userId: string, run: AgentRunState, now = Date.now()): Promise<{ run: AgentRunState; recommendationCount: number; evaluatedCount: number; excludedCount: number; warnings: string[] }> {
  const clock = { now: () => new Date(now).toISOString() };
  const routed = await githubCapabilityRouter.getSecurityFindings(supabase, userId, SECURITY_AGENT_KEY, { now });
  if (routed.denied) return { run: { ...run, status: "failed" as const, error: routed.denied.message, updatedAt: clock.now() }, recommendationCount: 0, evaluatedCount: 0, excludedCount: 0, warnings: routed.warnings };

  const results = Object.entries(routed.policies).map(([integrationId, entry]) => analyzeSecurityFindings(routed.records.filter((finding) => finding.integrationId === integrationId), entry.policy, entry.revision, now));
  const dynamicWarnings: string[] = [];
  const dynamicEvidence: unknown[] = [];
  const authorization = getRequest()?.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : null;
  if (token) {
    try {
      const availability = await getAgentMcpToolAvailability(supabase, routed.tenantId, SECURITY_AGENT_KEY);
      const playbookCapabilities = new Set(["security_findings", "user_inventory", "incident_signals", "operations_overview"]);
      const securityTools = availability.filter((tool) => tool.available && tool.capability && playbookCapabilities.has(tool.capability)).slice(0, 12);
      const dynamicResults = await Promise.all(securityTools.map(async (tool) => {
        try {
          const governed = await runGovernedWithToken(token, userId, {
            origin: "mcp",
            actionKey: tool.actionKey,
            executionClass: tool.executionClass,
            capability: tool.capability,
            provider: tool.provider,
          }, () => invokeDynamicMcpTool(supabase, routed.tenantId, tool, run.input ?? {}));
          if (!governed.ok) throw new Error(governed.reasons.join(" "));
          return { tool: tool.name, provider: tool.provider, capability: tool.capability, result: governed.result };
        } catch (error) {
          dynamicWarnings.push(`${tool.name}: ${error instanceof Error ? error.message : "security evidence read failed"}`);
          return null;
        }
      }));
      dynamicEvidence.push(...dynamicResults.filter(Boolean));
      if (!securityTools.length) dynamicWarnings.push("Data gap: no additional cross-provider security playbook tool is authorized for this run.");
    } catch (error) {
      dynamicWarnings.push(error instanceof Error ? error.message : "Additional provider security evidence could not be discovered.");
    }
  } else {
    dynamicWarnings.push("Data gap: authenticated MCP tool token was unavailable for cross-provider security discovery.");
  }
  const recommendations = results.flatMap((result) => result.recommendations);
  const evaluatedCount = results.reduce((count, result) => count + result.evaluatedCount, 0);
  const excludedCount = results.reduce((count, result) => count + result.excludedCount, 0);
  const actions: Parameters<typeof orchestrateAgentRun>[1] = [
    { type: "plan", value: { agentKey: SECURITY_AGENT_KEY, stages: ["investigate", "policy", "approval", "execute", "verify"], capability: "security_findings" } },
    { type: "investigate", value: toJsonValue({ records: routed.records, sources: routed.sources, dynamicProviderEvidence: dynamicEvidence, evaluatedAt: routed.evaluatedAt, warnings: [...routed.warnings, ...dynamicWarnings] }) },
    { type: "policy", value: toJsonValue({ recommendations, evaluatedCount, excludedCount, exceededRepositoryCeiling: results.some((result) => result.exceededRepositoryCeiling) }) },
  ];

  if (recommendations.length) {
    let changeRecordId: string | null = null;
    const previousApproval = run.approval && typeof run.approval === "object" ? run.approval as Record<string, unknown> : null;
    if (typeof previousApproval?.changeRecordId === "string") changeRecordId = previousApproval.changeRecordId;

    if (!changeRecordId) {
      const actor = { userId, tenantId: routed.tenantId, actorRole: "analyst" };
      const proposal = await createProposedChangeRecord(supabase, actor, {
        title: `Security remediation — ${recommendations.length} eligible GitHub finding${recommendations.length === 1 ? "" : "s"}`,
        businessImpact: `Aegis identified ${recommendations.length} policy-eligible GitHub security finding${recommendations.length === 1 ? "" : "s"}. No provider mutation is attempted until the existing Approval Center authorizes the proposed change.`,
        aiReasoning: recommendations.map((recommendation) => `${recommendation.repositoryName ?? "Repository"}: ${recommendation.title ?? recommendation.findingId} (${recommendation.severity}) — ${recommendation.reason}`).join(" | ").slice(0, 6000),
        proposedRiskFactors: [...new Set(recommendations.map((recommendation) => `${recommendation.severity} ${recommendation.findingType} finding`))],
        targetProvider: "github",
        targetAgent: SECURITY_AGENT_KEY,
        agentRunId: run.runId.replace(/^run-/, ""),
        proposedRiskTier: riskTier(recommendations),
      });
      changeRecordId = proposal.id;
    }

    actions.push({ type: "await_approval", value: { status: "pending", recommendationCount: recommendations.length, changeRecordId, reason: "Explicit approval is required before any provider mutation can be attempted." } });
  }

  const orchestration = orchestrateAgentRun(run, actions, clock);
  return { run: orchestration.run, recommendationCount: recommendations.length, evaluatedCount: evaluatedCount + dynamicEvidence.length, excludedCount, warnings: [...routed.warnings, ...dynamicWarnings] };
}
