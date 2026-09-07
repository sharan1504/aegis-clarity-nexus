import type { NormalizedSecurityFinding } from "@/lib/capabilities/registry";
import { evaluateSecurityFindingPolicy } from "@/lib/capabilities/security-policy-engine";
import type { AgentPolicy, PolicyRevision } from "@/lib/capabilities/policy";
import type { SecurityAnalysisResult, SecurityRecommendation } from "./types";

export function analyzeSecurityFindings(
  findings: NormalizedSecurityFinding[],
  policy: AgentPolicy,
  revision: PolicyRevision | null,
  now: number,
): SecurityAnalysisResult {
  const evaluation = evaluateSecurityFindingPolicy(findings, policy, revision, now);
  const recommendations: SecurityRecommendation[] = evaluation.recommendations.map((verdict) => {
    const finding = findings.find((f) => f.integrationId === verdict.integrationId && f.findingId === verdict.findingId);
    if (!finding) throw new Error(`Security finding ${verdict.findingId} disappeared during analysis.`);
    return {
      findingId: finding.findingId,
      repositoryName: finding.repositoryName,
      title: finding.title,
      severity: finding.severity,
      findingType: finding.findingType,
      reason: `GitHub ${finding.findingType} finding meets the configured ${verdict.evidence.threshold} severity threshold.`,
      url: finding.url,
      provenance: finding.provenance,
      evidence: verdict.evidence,
      approvalRequired: policy.approval_required,
    };
  });
  return {
    recommendations,
    excludedCount: evaluation.summary.excluded,
    evaluatedCount: evaluation.summary.total,
    exceededRepositoryCeiling: evaluation.summary.exceededRepositoryCeiling,
  };
}
