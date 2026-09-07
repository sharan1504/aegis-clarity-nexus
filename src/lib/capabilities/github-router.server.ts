import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { evaluateGuardrails } from "@/lib/guardrails/engine.server";
import { sanitizeOutput } from "@/lib/guardrails/sanitize";
import { authorizeCapabilityAccess, DENIAL_MESSAGES } from "./authorization.server";
import { evaluateFreshness, worstFreshness } from "./freshness";
import { getGitHubRepositories, getGitHubSecurityFindings } from "./github-provider.server";
import type { CapabilitySource, NormalizedRepository, NormalizedSecurityFinding } from "./registry";
import type { AgentPolicy, PolicyRevision } from "./policy";

type UserClient = SupabaseClient<Database>;
export interface GitHubRoutedResult<T> {
  tenantId: string;
  agentKey: string;
  records: T[];
  sources: CapabilitySource[];
  warnings: string[];
  evaluatedAt: string;
  freshness: ReturnType<typeof worstFreshness>;
  denied?: { reason: string; message: string };
  policies: Record<string, { policy: AgentPolicy; revision: PolicyRevision }>;
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function run<T>(supabase: UserClient, userId: string, agentKey: string, capability: "repo_inventory" | "security_findings", read: (db: any, source: any, tenantId: string) => Promise<T[]>, now = Date.now()): Promise<GitHubRoutedResult<T>> {
  const decision = await authorizeCapabilityAccess(supabase, userId, agentKey, capability, { now });
  if (!decision.ok || !decision.tenantId) return { tenantId: decision.tenantId ?? "", agentKey, records: [], sources: [], warnings: decision.reason ? [DENIAL_MESSAGES[decision.reason]] : [], evaluatedAt: new Date(now).toISOString(), freshness: "unavailable", denied: decision.reason ? { reason: decision.reason, message: DENIAL_MESSAGES[decision.reason] } : undefined, policies: {} };
  const result: GitHubRoutedResult<T> = { tenantId: decision.tenantId, agentKey, records: [], sources: [], warnings: decision.denials.map((d) => DENIAL_MESSAGES[d.reason]), evaluatedAt: new Date(now).toISOString(), freshness: "unavailable", policies: {} };
  const admin = await db();
  for (const source of decision.sources.filter((s) => s.provider === "github")) {
    result.policies[source.integrationId] = { policy: source.policy, revision: source.policyRevision };
    const freshness = evaluateFreshness(source.lastSyncAt, now);
    const base: CapabilitySource = { integrationId: source.integrationId, provider: source.provider, displayName: source.displayName, implemented: true, recordCount: 0, lastSyncAt: source.lastSyncAt, snapshotId: source.snapshotId, freshness: freshness.state, freshnessAgeMs: freshness.ageMs, policyVersion: source.policyRevision.version };
    const guardrail = await evaluateGuardrails(supabase, { tenantId: decision.tenantId, actorRole: decision.roles[0] ?? null, origin: "capability_router", agentKey, provider: source.provider, integrationId: source.integrationId, capability, actionKey: `capability.${capability}`, environment: source.isMock ? "development" : "production", executionClass: "read_only", freshness: freshness.state, dataClassification: "confidential" }, { userId });
    if (!guardrail.allowed) { const warning = guardrail.reasons[0] ?? "A guardrail prevented GitHub data from being read."; result.warnings.push(warning); result.sources.push({ ...base, warning }); continue; }
    try {
      const records = await read(admin, source, decision.tenantId);
      const capped = guardrail.maxRecords == null ? records : records.slice(0, guardrail.maxRecords);
      result.records.push(...sanitizeOutput(capped, guardrail.redactFields));
      result.sources.push({ ...base, recordCount: capped.length });
    } catch (error) {
      console.error("[github-capability-router] provider read failed", { capability, integrationId: source.integrationId, error: error instanceof Error ? error.message : "unknown" });
      result.warnings.push(`${source.displayName} could not be read for ${capability}.`);
      result.sources.push({ ...base, warning: result.warnings.at(-1) });
    }
  }
  if (!result.sources.length) result.warnings.push("GitHub does not yet supply this capability or is not connected for this agent.");
  result.freshness = worstFreshness(result.sources.map((s) => s.freshness));
  return result;
}

export const githubCapabilityRouter = {
  getRepositories: (supabase: UserClient, userId: string, agentKey: string, options?: { now?: number }) => run<NormalizedRepository>(supabase, userId, agentKey, "repo_inventory", getGitHubRepositories, options?.now),
  getSecurityFindings: (supabase: UserClient, userId: string, agentKey: string, options?: { now?: number }) => run<NormalizedSecurityFinding>(supabase, userId, agentKey, "security_findings", getGitHubSecurityFindings, options?.now),
};
