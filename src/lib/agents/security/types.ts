import type { NormalizedSecurityFinding } from "@/lib/capabilities/registry";
import type { SecurityFindingVerdict } from "@/lib/capabilities/security-policy-engine";

export const SECURITY_AGENT_KEY = "agent-security" as const;

export interface SecurityRecommendation {
  findingId: string;
  repositoryName: string | null;
  title: string | null;
  severity: NormalizedSecurityFinding["severity"];
  findingType: string;
  reason: string;
  url: string | null;
  provenance: NormalizedSecurityFinding["provenance"];
  evidence: SecurityFindingVerdict["evidence"];
  approvalRequired: boolean;
}

export interface SecurityAnalysisResult {
  recommendations: SecurityRecommendation[];
  excludedCount: number;
  evaluatedCount: number;
  exceededRepositoryCeiling: boolean;
}
