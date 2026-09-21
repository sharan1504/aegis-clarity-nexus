export type CenOpsResponseType = "executive" | "operational" | "investigation" | "product" | "how_to" | "status";
export type CenOpsSeverity = "critical" | "high" | "medium" | "low" | "info";
export interface CenOpsKeyFinding { title: string; detail: string; severity?: CenOpsSeverity; status?: string; }
export interface CenOpsMetric { label: string; value: string; change?: string; trend?: "up" | "down" | "flat"; severity?: CenOpsSeverity; }
export interface CenOpsRisk { title: string; whyItMatters: string; impact: string; evidence: string[]; priority: number; severity?: CenOpsSeverity; }
export interface CenOpsOpportunity { title: string; value?: string; rationale: string; evidence: string[]; }
export interface CenOpsRecommendation { title: string; rationale: string; impact: string; risk: string; nextStep: string; actionType?: string; requiresApproval?: boolean; }
export interface CenOpsEvidence { source: string; detail: string; timestamp?: string; }
export interface CenOpsFollowUp { label: string; prompt: string; route?: string; }
export interface CenOpsOperationalContext {
  affectedServices?: string[];
  timeline?: Array<{ label: string; detail: string; timestamp?: string }>;
  correlations?: Array<{ title: string; detail: string; severity?: CenOpsSeverity }>;
  rootCauseHypotheses?: Array<{ title: string; rationale: string; confidence?: number }>;
  businessImpact?: string[];
  verificationPlan?: string[];
  approvalState?: "not_required" | "pending";
}
export interface CenOpsResponse {
  responseType: CenOpsResponseType;
  executiveSummary: string;
  keyFindings: CenOpsKeyFinding[];
  metrics: CenOpsMetric[];
  risks: CenOpsRisk[];
  opportunities: CenOpsOpportunity[];
  recommendations: CenOpsRecommendation[];
  whatChanged: string[];
  whatRequiresAttention: string[];
  evidence: CenOpsEvidence[];
  confidence: number;
  actionRequired: boolean;
  followUps: CenOpsFollowUp[];
  operationalContext?: CenOpsOperationalContext;
}
const asString = (value: unknown, fallback = "") => typeof value === "string" ? value.trim() : fallback;
const asArray = <T,>(value: unknown, mapper: (item: unknown) => T): T[] => Array.isArray(value) ? value.map(mapper).filter(Boolean) : [];
const severity = (value: unknown): CenOpsSeverity | undefined => ["critical", "high", "medium", "low", "info"].includes(String(value).toLowerCase()) ? String(value).toLowerCase() as CenOpsSeverity : undefined;
const outOfScopeResponse = (): CenOpsResponse => ({
  responseType: "product",
  executiveSummary: "That request is outside CenOps scope. CenOps is focused on tenant operations, integrations, agents, guardrails, productivity, risk, and investigations.",
  keyFindings: [],
  metrics: [],
  risks: [],
  opportunities: [],
  recommendations: [],
  whatChanged: [],
  whatRequiresAttention: [],
  evidence: [],
  confidence: 0,
  actionRequired: false,
  followUps: [],
});
export function responseTypeForIntent(intent: string): CenOpsResponseType {
  if (intent === "platform_overview" || intent === "product_feature" || intent === "integration_discovery" || intent === "agent_explanation") return "product";
  if (intent === "integration_how_to" || intent === "agent_configuration") return "how_to";
  if (intent === "integration_status") return "status";
  if (intent === "investigation") return "investigation";
  return "operational";
}
export function normalizeCenOpsResponse(raw: unknown, intent: string): CenOpsResponse {
  if (intent === "out_of_scope") return outOfScopeResponse();
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const fallbackAnswer = asString(value.answer, "Analysis complete.");
  const type = ["executive", "operational", "investigation", "product", "how_to", "status"].includes(String(value.responseType)) ? String(value.responseType) as CenOpsResponseType : responseTypeForIntent(intent);
  const recommendations = asArray(value.recommendations, (item) => { const r = (item && typeof item === "object" ? item : {}) as Record<string, unknown>; return { title: asString(r.title, "Recommended next step"), rationale: asString(r.rationale), impact: asString(r.impact, "Operational improvement"), risk: asString(r.risk, "Not assessed"), nextStep: asString(r.nextStep, asString(r.rationale)), actionType: asString(r.actionType) || undefined, requiresApproval: r.requiresApproval === true }; });
  const contextRaw = (value.operationalContext && typeof value.operationalContext === "object" ? value.operationalContext : {}) as Record<string, unknown>;
  const operationalContext: CenOpsOperationalContext = {
    affectedServices: asArray(contextRaw.affectedServices, (x) => asString(x)).slice(0, 8),
    timeline: asArray(contextRaw.timeline, (item) => { const x = (item && typeof item === "object" ? item : {}) as Record<string, unknown>; return { label: asString(x.label, "Evidence"), detail: asString(x.detail), timestamp: asString(x.timestamp) || undefined }; }).slice(0, 8),
    correlations: asArray(contextRaw.correlations, (item) => { const x = (item && typeof item === "object" ? item : {}) as Record<string, unknown>; return { title: asString(x.title, "Correlation"), detail: asString(x.detail), severity: severity(x.severity) }; }).slice(0, 8),
    rootCauseHypotheses: asArray(contextRaw.rootCauseHypotheses, (item) => { const x = (item && typeof item === "object" ? item : {}) as Record<string, unknown>; const confidence = Number(x.confidence); return { title: asString(x.title, "Hypothesis"), rationale: asString(x.rationale), confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : undefined }; }).slice(0, 5),
    businessImpact: asArray(contextRaw.businessImpact, (x) => asString(x)).slice(0, 8),
    verificationPlan: asArray(contextRaw.verificationPlan, (x) => asString(x)).slice(0, 8),
    approvalState: contextRaw.approvalState === "pending" ? "pending" : contextRaw.approvalState === "not_required" ? "not_required" : undefined,
  };
  const hasContext = Object.values(operationalContext).some((item) => Array.isArray(item) ? item.length > 0 : Boolean(item));
  const evidence = asArray(value.evidence, (item) => { const x = (item && typeof item === "object" ? item : {}) as Record<string, unknown>; return { source: asString(x.source, "CenOps evidence"), detail: asString(x.detail), timestamp: asString(x.timestamp) || undefined }; }).slice(0, 12);
  return {
    responseType: type,
    executiveSummary: asString(value.executiveSummary, fallbackAnswer),
    keyFindings: asArray(value.keyFindings, (item) => { const x = (item && typeof item === "object" ? item : {}) as Record<string, unknown>; return { title: asString(x.title, "Finding"), detail: asString(x.detail), severity: severity(x.severity), status: asString(x.status) || undefined }; }),
    metrics: asArray(value.metrics, (item) => { const x = (item && typeof item === "object" ? item : {}) as Record<string, unknown>; const trend = ["up", "down", "flat"].includes(String(x.trend)) ? String(x.trend) as "up" | "down" | "flat" : undefined; return { label: asString(x.label, "Metric"), value: asString(x.value, "Not available"), change: asString(x.change) || undefined, trend, severity: severity(x.severity) }; }),
    risks: asArray(value.risks, (item) => { const x = (item && typeof item === "object" ? item : {}) as Record<string, unknown>; return { title: asString(x.title, "Risk"), whyItMatters: asString(x.whyItMatters), impact: asString(x.impact), evidence: asArray(x.evidence, (e) => asString(e)).slice(0, 6), priority: Number.isFinite(Number(x.priority)) ? Number(x.priority) : 99, severity: severity(x.severity) }; }).sort((a, b) => a.priority - b.priority).slice(0, 10),
    opportunities: asArray(value.opportunities, (item) => { const x = (item && typeof item === "object" ? item : {}) as Record<string, unknown>; return { title: asString(x.title, "Opportunity"), value: asString(x.value) || undefined, rationale: asString(x.rationale), evidence: asArray(x.evidence, (e) => asString(e)).slice(0, 6) }; }).slice(0, 10),
    recommendations: recommendations.slice(0, 8),
    whatChanged: asArray(value.whatChanged, (x) => asString(x)).slice(0, 8),
    whatRequiresAttention: asArray(value.whatRequiresAttention, (x) => asString(x)).slice(0, 8),
    evidence,
    confidence: evidence.length > 0 ? Math.max(0, Math.min(100, Number(value.confidence ?? 0) || 0)) : 0,
    actionRequired: value.actionRequired === true,
    followUps: asArray(value.followUps, (item) => { const x = (item && typeof item === "object" ? item : {}) as Record<string, unknown>; return { label: asString(x.label, "Explore further"), prompt: asString(x.prompt), route: asString(x.route) || undefined }; }).filter((x) => x.prompt).slice(0, 5),
    operationalContext: hasContext ? operationalContext : undefined,
  };
}
export function formatCenOpsResponse(response: CenOpsResponse): string {
  const lines = [response.executiveSummary];

  // Product and how-to answers should read like a focused agent response.
  // Their primary answer already lives in executiveSummary; do not append
  // operational dashboard scaffolding or tenant evidence unless it is relevant.
  if (response.responseType === "product" || response.responseType === "how_to") {
    return lines.join("\n");
  }

  if (response.keyFindings.length) lines.push("", "### Key findings", ...response.keyFindings.map((x) => `- **${x.title}**${x.severity ? ` (${x.severity})` : ""}: ${x.detail}${x.status ? ` — ${x.status}` : ""}`));
  if (response.metrics.length) lines.push("", "### At a glance", ...response.metrics.map((x) => `- **${x.label}:** ${x.value}${x.change ? ` — ${x.change}` : ""}`));
  if (response.risks.length) lines.push("", "### Top risks", ...response.risks.slice(0, 5).map((x) => `- **${x.title}**${x.severity ? ` (${x.severity})` : ""} — ${x.whyItMatters} **Impact:** ${x.impact}`));
  if (response.opportunities.length) lines.push("", "### Opportunities", ...response.opportunities.slice(0, 5).map((x) => `- **${x.title}**${x.value ? ` — ${x.value}` : ""}: ${x.rationale}`));
  if (response.whatChanged.length) lines.push("", "### What changed", ...response.whatChanged.map((x) => `- ${x}`));
  if (response.whatRequiresAttention.length) lines.push("", "### Requires attention", ...response.whatRequiresAttention.map((x) => `- ${x}`));
  if (response.recommendations.length) lines.push("", "### Recommended next steps", ...response.recommendations.slice(0, 5).map((x) => `- **${x.title}**: ${x.rationale} **Next:** ${x.nextStep}${x.requiresApproval ? " _(approval required)_" : ""}`));
  if (response.evidence.length) lines.push("", "<details><summary>Evidence and technical details</summary>", ...response.evidence.slice(0, 8).map((x) => `- **${x.source}:** ${x.detail}${x.timestamp ? ` (${x.timestamp})` : ""}`), "</details>");
  return lines.join("\n");
}
