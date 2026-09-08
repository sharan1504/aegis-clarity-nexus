import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { githubCapabilityRouter } from "@/lib/capabilities/github-router.server";
import { analyzeSecurityFindings } from "@/lib/agents/security/analysis";
import { SECURITY_AGENT_KEY } from "@/lib/agents/security/types";
import { orchestrateAgentRun } from "./agent-runtime-orchestrator";
import type { AgentRunState } from "./agent-runtime";

type UserClient = SupabaseClient<Database>;

export async function orchestrateSecurityRun(supabase: UserClient, userId: string, run: AgentRunState, now = Date.now()) {
  const clock = { now: () => new Date(now).toISOString() };
  const routed = await githubCapabilityRouter.getSecurityFindings(supabase, userId, SECURITY_AGENT_KEY, { now });
  if (routed.denied) return { run: { ...run, status: "failed", error: routed.denied.message, updatedAt: clock.now() }, recommendationCount: 0, evaluatedCount: 0, excludedCount: 0, warnings: routed.warnings };

  const results = Object.entries(routed.policies).map(([integrationId, entry]) => analyzeSecurityFindings(routed.records.filter((finding) => finding.integrationId === integrationId), entry.policy, entry.revision, now));
  const recommendations = results.flatMap((result) => result.recommendations);
  const evaluatedCount = results.reduce((count, result) => count + result.evaluatedCount, 0);
  const excludedCount = results.reduce((count, result) => count + result.excludedCount, 0);
  const actions: Parameters<typeof orchestrateAgentRun>[1] = [
    { type: "investigate", value: { records: routed.records, sources: routed.sources, evaluatedAt: routed.evaluatedAt } },
    { type: "policy", value: { recommendations, evaluatedCount, excludedCount, exceededRepositoryCeiling: results.some((result) => result.exceededRepositoryCeiling) } },
  ];
  if (recommendations.length) actions.push({ type: "await_approval", value: { status: "pending", recommendationCount: recommendations.length, reason: "Explicit approval is required before any mutation can be attempted." } });
  const orchestration = orchestrateAgentRun(run, actions, clock);
  return { run: orchestration.run, recommendationCount: recommendations.length, evaluatedCount, excludedCount, warnings: routed.warnings };
}
