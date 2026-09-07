import type { AgentPolicy, PolicyRevision, RiskThreshold } from "./policy";
import type { FreshnessState } from "./freshness";

export type SecurityFindingSeverity = "low" | "medium" | "high" | "critical" | "unknown";

export interface NormalizedSecurityFinding {
  provider: string;
  integrationId: string;
  findingId: string;
  repositoryName: string | null;
  findingType: string;
  title: string | null;
  severity: SecurityFindingSeverity;
  state: string | null;
  url: string | null;
  providerUpdatedAt: string | null;
  metadata: Record<string, unknown>;
  provenance: {
    provider: string;
    integrationId: string;
    sourceSystem: string;
    source: string;
    snapshotId: string | null;
    syncId: string | null;
    dataAsOf: string | null;
    lastSuccessfulSyncAt: string | null;
    freshness: FreshnessState;
  };
}

export interface SecurityFindingVerdict {
  provider: string;
  integrationId: string;
  findingId: string;
  repositoryName: string | null;
  severity: SecurityFindingSeverity;
  considered: boolean;
  reason: "severity_threshold_met" | "below_severity_threshold" | "accepted_risk" | "repository_ceiling" | "unknown_severity";
  evidence: {
    title: string | null;
    findingType: string;
    repositoryName: string | null;
    severity: SecurityFindingSeverity;
    threshold: RiskThreshold;
    exclusionKey: string | null;
    providerUpdatedAt: string | null;
    provenance: NormalizedSecurityFinding["provenance"];
  };
}

export interface SecurityPolicyEvaluation {
  policyVersion: number;
  policyRevision: PolicyRevision | null;
  appliedPolicy: AgentPolicy;
  evaluatedAt: string;
  verdicts: SecurityFindingVerdict[];
  recommendations: SecurityFindingVerdict[];
  summary: { total: number; considered: number; excluded: number; exceededRepositoryCeiling: boolean };
}

const RANK: Record<SecurityFindingSeverity | RiskThreshold, number> = {
  unknown: -1, low: 0, medium: 1, high: 2, critical: 3,
};

function threshold(policy: AgentPolicy): RiskThreshold {
  const configured = policy.configuration["security_severity_threshold"];
  return typeof configured === "string" && configured in RANK ? (configured as RiskThreshold) : policy.risk_threshold;
}

function exclusionKeys(policy: AgentPolicy): Set<string> {
  const configured = policy.configuration["security_accepted_risk_keys"];
  if (typeof configured !== "string") return new Set();
  return new Set(configured.split(",").map((v) => v.trim()).filter(Boolean));
}

function keyFor(finding: NormalizedSecurityFinding): string {
  return `${finding.repositoryName ?? ""}::${finding.findingId}`;
}

/** Pure, deterministic security policy evaluation. The clock is injectable and is only used for audit metadata. */
export function evaluateSecurityFindingPolicy(
  findings: NormalizedSecurityFinding[],
  policy: AgentPolicy,
  revision: PolicyRevision | null = null,
  now = Date.now(),
): SecurityPolicyEvaluation {
  const severityThreshold = threshold(policy);
  const accepted = exclusionKeys(policy);
  const perRepo = new Map<string, number>();
  const verdicts = [...findings]
    .sort((a, b) => (a.repositoryName ?? "").localeCompare(b.repositoryName ?? "") || RANK[b.severity] - RANK[a.severity] || a.findingId.localeCompare(b.findingId))
    .map((finding): SecurityFindingVerdict => {
      const repo = finding.repositoryName ?? "__unknown_repository__";
      const base = {
        provider: finding.provider, integrationId: finding.integrationId, findingId: finding.findingId,
        repositoryName: finding.repositoryName, severity: finding.severity,
        evidence: { title: finding.title, findingType: finding.findingType, repositoryName: finding.repositoryName,
          severity: finding.severity, threshold: severityThreshold, exclusionKey: null, providerUpdatedAt: finding.providerUpdatedAt,
          provenance: finding.provenance },
      };
      const exclusionKey = keyFor(finding);
      if (accepted.has(exclusionKey) || accepted.has(finding.findingId)) {
        return { ...base, considered: false, reason: "accepted_risk", evidence: { ...base.evidence, exclusionKey } };
      }
      if (finding.severity === "unknown") return { ...base, considered: false, reason: "unknown_severity" };
      if (RANK[finding.severity] < RANK[severityThreshold]) return { ...base, considered: false, reason: "below_severity_threshold" };
      const used = perRepo.get(repo) ?? 0;
      if (used >= policy.maximum_affected_records) return { ...base, considered: false, reason: "repository_ceiling" };
      perRepo.set(repo, used + 1);
      return { ...base, considered: true, reason: "severity_threshold_met" };
    });
  const recommendations = verdicts.filter((v) => v.considered);
  return {
    policyVersion: revision?.version ?? 1,
    policyRevision: revision,
    appliedPolicy: policy,
    evaluatedAt: new Date(now).toISOString(),
    verdicts,
    recommendations,
    summary: {
      total: verdicts.length,
      considered: recommendations.length,
      excluded: verdicts.filter((v) => !v.considered).length,
      exceededRepositoryCeiling: verdicts.some((v) => v.reason === "repository_ceiling"),
    },
  };
}
