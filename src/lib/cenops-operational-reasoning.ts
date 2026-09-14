import type { CenOpsResponse, CenOpsSeverity } from "@/lib/cenops-response-intelligence";

export type CenOpsReasoning = {
  assessment: string;
  businessImpact: string;
  priority: "critical" | "high" | "medium" | "low" | "info";
  rationale: string[];
  verificationPlan: string[];
};

const severityRank: Record<CenOpsSeverity, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };

export function deriveCenOpsReasoning(response: CenOpsResponse): CenOpsReasoning {
  const topRisk = [...response.risks].sort((a, b) => a.priority - b.priority || severityRank[b.severity ?? "info"] - severityRank[a.severity ?? "info"])[0];
  const topFinding = [...response.keyFindings].sort((a, b) => severityRank[b.severity ?? "info"] - severityRank[a.severity ?? "info"])[0];
  const priority = topRisk?.severity ?? topFinding?.severity ?? (response.actionRequired ? "high" : response.opportunities.length ? "low" : "info");
  const assessment = topRisk ? `${topRisk.title} is the highest-priority observed risk.` : topFinding ? `${topFinding.title} is the most material observed finding.` : response.opportunities.length ? "The current evidence indicates optimization opportunities without a material risk being established." : "No material operational risk is established by the available evidence.";
  const businessImpact = topRisk?.impact || topFinding?.detail || (response.opportunities[0]?.rationale ?? "No business impact can be established from the available evidence.");
  const rationale = [
    topRisk ? `Priority is driven by the risk ranking and available supporting evidence: ${topRisk.evidence.slice(0, 2).join("; ") || "risk evidence is recorded in the response."}` : "No prioritized risk with supporting evidence was provided.",
    response.metrics.length ? `${response.metrics.length} observed metric${response.metrics.length === 1 ? "" : "s"} are available for context.` : "No measured metrics were supplied.",
    response.evidence.length ? `${response.evidence.length} evidence item${response.evidence.length === 1 ? "" : "s"} support the assessment.` : "The assessment has limited evidence coverage.",
  ];
  const verificationPlan = response.recommendations.slice(0, 3).map((r) => `Verify outcome of “${r.title}” against the expected impact: ${r.impact}.`);
  if (!verificationPlan.length) verificationPlan.push("Re-check the same authorized evidence sources after any approved change.");
  return { assessment, businessImpact, priority, rationale, verificationPlan };
}
