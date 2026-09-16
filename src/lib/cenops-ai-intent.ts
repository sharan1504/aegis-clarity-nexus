export type CenOpsAiIntent =
  | "platform_overview"
  | "product_feature"
  | "integration_discovery"
  | "integration_how_to"
  | "integration_status"
  | "agent_explanation"
  | "agent_configuration"
  | "productivity_analysis"
  | "productivity_report"
  | "operational_analysis"
  | "investigation"
  | "governance"
  | "out_of_scope"
  | "unknown";

export interface CenOpsAiIntentResult {
  intent: CenOpsAiIntent;
  confidence: number;
  productQuestion: boolean;
  requiresLiveEvidence: boolean;
}

const hasAny = (text: string, terms: string[]) => terms.some((term) => text.includes(term));

export function classifyCenOpsIntent(message: string): CenOpsAiIntentResult {
  const text = message.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  if (hasAny(text, ["productivity agent", "what does the productivity agent", "what is the productivity agent", "explain the productivity agent", "productivity agent do"])) {
    return { intent: "agent_explanation", confidence: 0.95, productQuestion: true, requiresLiveEvidence: false };
  }
  if (hasAny(text, ["productivity report", "generate report", "detailed report", "performance report", "productivity summary"])) {
    return { intent: "productivity_report", confidence: 0.95, productQuestion: false, requiresLiveEvidence: true };
  }
  if (hasAny(text, ["productivity", "tickets handled", "cases handled", "work items handled", "throughput", "cycle time", "how many tickets", "how many cases", "performance this week", "performance this month", "last 3 months", "last 6 months", "last 12 months", "past 3 months", "past 6 months", "past year"])) {
    return { intent: "productivity_analysis", confidence: 0.94, productQuestion: false, requiresLiveEvidence: true };
  }
  if (hasAny(text, ["approval", "permission", "audit", "governance", "read only", "approval gate"])) {
    return { intent: "governance", confidence: 0.92, productQuestion: true, requiresLiveEvidence: hasAny(text, ["my", "current", "pending", "who approved", "approval status"]) };
  }
  if (hasAny(text, ["investigate", "investigation", "root cause", "why did", "what caused", "correlate"])) {
    return { intent: "investigation", confidence: 0.94, productQuestion: false, requiresLiveEvidence: true };
  }
  if (hasAny(text, ["current incidents", "open incidents", "open findings", "current health", "what is happening", "show my", "latest findings", "live status", "right now"])) {
    return { intent: "operational_analysis", confidence: 0.95, productQuestion: false, requiresLiveEvidence: true };
  }
  if (hasAny(text, ["configure agent", "configure the agent", "agent settings", "agent instructions", "agent binding", "bind agent"])) {
    return { intent: "agent_configuration", confidence: 0.93, productQuestion: true, requiresLiveEvidence: false };
  }
  if (hasAny(text, ["agent", "what does the security agent", "what does the incident agent", "what does the license agent", "what does the cloud optimization agent", "knowledge assistant"])) {
    return { intent: "agent_explanation", confidence: 0.93, productQuestion: true, requiresLiveEvidence: false };
  }
  if (hasAny(text, ["not connected", "isn't connected", "isnt connected", "connection status", "connected to", "connected?", "disconnected", "failed connection"])) {
    return { intent: "integration_status", confidence: 0.94, productQuestion: true, requiresLiveEvidence: true };
  }
  if (hasAny(text, ["how to connect", "how do i connect", "guide me through", "setup", "set up", "configure integration", "connect jira", "connect aws", "connect genesys", "authentication"])) {
    return { intent: "integration_how_to", confidence: 0.95, productQuestion: true, requiresLiveEvidence: false };
  }
  if (hasAny(text, ["integrations", "providers", "available integrations", "what can i connect", "supported providers", "integration catalog"])) {
    return { intent: "integration_discovery", confidence: 0.96, productQuestion: true, requiresLiveEvidence: false };
  }
  if (hasAny(text, ["feature", "features", "capability", "capabilities", "what can it do", "what does cenops do", "how does cenops work"])) {
    return { intent: "product_feature", confidence: 0.9, productQuestion: true, requiresLiveEvidence: false };
  }
  if (hasAny(text, ["tell me more", "what is this platform", "what is this platform about", "what this platform is about", "what does this platform do", "what is cenops", "what is cenops about", "what does cenops do", "overview", "about this platform", "what is this"])) {
    return { intent: "platform_overview", confidence: 0.98, productQuestion: true, requiresLiveEvidence: false };
  }

  // The existing Copilot path uses productQuestion as its legacy "no live evidence" gate.
  // Keep it true here only to prevent provider evidence loading; the authoritative scope is intent=out_of_scope.
  return { intent: "out_of_scope", confidence: 0.99, productQuestion: true, requiresLiveEvidence: false };
}
