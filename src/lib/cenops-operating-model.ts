import type { CenOpsResponse, CenOpsSeverity } from "@/lib/cenops-response-intelligence";

export type CenOpsOperatingStage = "complete" | "active" | "pending" | "not_required";
export interface CenOpsOperatingStageState { key: string; label: string; description: string; status: CenOpsOperatingStage; }
export interface CenOpsOperationalContext {
  affectedServices: string[];
  timeline: Array<{ label: string; detail: string; timestamp?: string }>;
  correlations: Array<{ title: string; detail: string; severity?: CenOpsSeverity }>;
  rootCauseHypotheses: Array<{ title: string; rationale: string; confidence?: number }>;
  businessImpact: string[];
  verificationPlan: string[];
  approvalState: "not_required" | "pending";
}

const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 8);

export function deriveCenOpsOperationalContext(response: CenOpsResponse): CenOpsOperationalContext {
  const affectedServices = unique(response.evidence.map((item) => item.source));
  const timeline = response.evidence
    .filter((item) => item.timestamp)
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))
    .slice(0, 8)
    .map((item) => ({ label: item.source, detail: item.detail, timestamp: item.timestamp }));
  const businessImpact = unique(response.risks.map((risk) => `${risk.title}: ${risk.impact}`));
  const verificationPlan = unique(response.recommendations.map((recommendation) => recommendation.nextStep));
  return {
    affectedServices,
    timeline,
    correlations: [],
    rootCauseHypotheses: [],
    businessImpact,
    verificationPlan,
    approvalState: response.actionRequired ? "pending" : "not_required",
  };
}

export function deriveCenOpsOperatingLoop(response: CenOpsResponse): CenOpsOperatingStageState[] {
  const hasEvidence = response.evidence.length > 0;
  const hasFindings = response.keyFindings.length > 0 || response.risks.length > 0;
  const hasRecommendations = response.recommendations.length > 0;
  const hasVerification = response.recommendations.some((item) => Boolean(item.nextStep));
  return [
    { key: "observe", label: "Observe", description: "Authorized evidence", status: hasEvidence ? "complete" : "pending" },
    { key: "understand", label: "Understand", description: "Decision context", status: response.executiveSummary ? "complete" : "pending" },
    { key: "correlate", label: "Correlate", description: "Cross-signal relationships", status: response.keyFindings.length > 1 ? "complete" : "active" },
    { key: "risk", label: "Detect risk", description: "Material exposure", status: response.risks.length ? "complete" : "not_required" },
    { key: "impact", label: "Assess impact", description: "Business consequence", status: response.risks.some((risk) => Boolean(risk.impact)) ? "complete" : hasFindings ? "active" : "pending" },
    { key: "recommend", label: "Recommend", description: "Governed next step", status: hasRecommendations ? "complete" : "pending" },
    { key: "approve", label: "Approval", description: "Human decision gate", status: response.actionRequired ? "pending" : "not_required" },
    { key: "verify", label: "Verify", description: "Confirm outcome", status: hasVerification ? "active" : response.actionRequired ? "pending" : "not_required" },
    { key: "learn", label: "Learn", description: "Feedback & evaluation", status: "active" },
  ];
}
