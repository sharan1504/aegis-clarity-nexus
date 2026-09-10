import { toJsonValue } from "@/lib/json";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { githubCapabilityRouter } from "@/lib/capabilities/github-router.server";
import { analyzeSecurityFindings } from "@/lib/agents/security/analysis";
import { SECURITY_AGENT_KEY } from "@/lib/agents/security/types";
import { createProposedChangeRecord } from "@/lib/change-proposal.server";
import { orchestrateAgentRun } from "./agent-runtime-orchestrator";
import type { AgentRunState } from "./agent-runtime";

type UserClient = SupabaseClient<Database>;
function riskTier(recommendations: Array<{ severity: string }>): "Medium" | "High" | "Critical" { if (recommendations.some((recommendation) => recommendation.severity === "critical")) return "Critical"; if (recommendations.some((recommendation) => recommendation.severity === "high")) return "High"; return "Medium"; }

export async function orchestrateSecurityRun(supabase: UserClient, userId: string, run: AgentRunState, now = Date.now()): Promise<{ run: AgentRunState; recommendationCount: number; evaluatedCount: number; excludedCount: number; warnings: string[] }> {
  const clock = { now: () => new Date(now).toISOString() };
  const routed = await githubCapabilityRouter.getSecurityFindings(supabase, userId, SECURITY_AGENT_KEY, { now });
  if (routed.denied) return { run: { ...run, status: "failed" as const, error: routed.denied.message, updatedAt: clock.now() }, recommendationCount: 0, evaluatedCount: 0, excludedCount: 0, warnings: routed.warnings };
  const results = Object.entries(routed.policies).map(([integrationId, entry]) => analyzeSecurityFindings(routed.records.filter((finding) => finding.integrationId === integrationId), entry.policy, entry.revision, now));
  const recommendations = results.flatMap((result) => result.recommendations);
  const evaluatedCount = results.reduce((count, result) => count + result.evaluatedCount, 0);
  const excludedCount = results.reduce((count, result) => count + result.excludedCount, 0);
  const recommendationIntegrationIds = recommendations.map((recommendation) => recommendation.provenance?.integrationId).filter((value): value is string => typeof value === "string");
  const integrationIds = [...new Set(recommendationIntegrationIds.length ? recommendationIntegrationIds : Object.keys(routed.policies))];
  const actions: Parameters<typeof orchestrateAgentRun>[1] = [
    { type: "plan", value: { agentKey: SECURITY_AGENT_KEY, stages: ["investigate", "policy", "approval", "execute", "verify"], capability: "security_findings", execution: "github.create_remediation_issue" } },
    { type: "investigate", value: toJsonValue({ records: routed.records, sources: routed.sources, evaluatedAt: routed.evaluatedAt }) },
    { type: "policy", value: toJsonValue({ recommendations, evaluatedCount, excludedCount, exceededRepositoryCeiling: results.some((result) => result.exceededRepositoryCeiling) }) },
  ];
  if (recommendations.length) {
    if (integrationIds.length !== 1) throw new Error("Security remediation execution requires recommendations from exactly one GitHub integration per change record.");
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
        targetIntegrationId: integrationIds[0],
        agentRunId: run.runId.replace(/^run-/, ""),
        proposedRiskTier: riskTier(recommendations),
      });
      changeRecordId = proposal.id;
    }
    actions.push({ type: "await_approval", value: { status: "pending", recommendationCount: recommendations.length, changeRecordId, integrationId: integrationIds[0], reason: "Explicit approval is required before any provider mutation can be attempted." } });
  }
  const orchestration = orchestrateAgentRun(run, actions, clock);
  return { run: orchestration.run, recommendationCount: recommendations.length, evaluatedCount, excludedCount, warnings: routed.warnings };
}
