import { PROVIDER_REGISTRY, type ProviderDefinition } from "@/lib/integrations/provider-registry";

export interface CenOpsKnowledgeEntry {
  topic: string;
  content: string;
  keywords: string[];
}

const providerKnowledge = (provider: ProviderDefinition): CenOpsKnowledgeEntry => ({
  topic: `${provider.name} integration`,
  keywords: [provider.id, provider.name.toLowerCase(), "integration", "connect", "configure", "setup", "sync", "authentication"],
  content: [
    `${provider.name} is an ${provider.availability === "available" ? "available" : "upcoming"} provider in the CenOps Integrations catalog.`,
    `Category: ${provider.category}. ${provider.description}`,
    `Authentication: ${provider.auth}. CenOps declares these scopes/capabilities: ${provider.scopes.length ? provider.scopes.join(", ") : "none listed"}; capabilities: ${provider.capabilities.join(", ")}.`,
    provider.availability === "available"
      ? `Generic connection flow: 1) Open Integrations in CenOps. 2) Select ${provider.name}. 3) Choose the connection method shown by CenOps (${provider.auth}). 4) Grant only the requested permissions or credentials. 5) Complete provider authorization or credential validation. 6) Confirm the provider shows Connected. 7) Run or wait for synchronization before asking CenOps for provider-specific live data. 8) If connection fails, verify the documented authentication and permission requirements and review the integration error.`
      : `Connection guidance: ${provider.name} is currently marked coming soon in the CenOps provider registry. Do not tell the user that a live connection can be completed yet.`,
  ].join("\n"),
});

const platformEntries: CenOpsKnowledgeEntry[] = [
  {
    topic: "CenOps platform",
    keywords: ["cenops", "platform", "what is this", "what does this do", "features", "how does it work", "tell me more", "overview", "product", "capabilities"],
    content: `CenOps is a governed enterprise operations platform that brings business and technology systems into one operational workspace. It combines an integrations catalog, synchronized provider evidence, specialized AI agents, investigations, findings, recommendations, approvals, audit trails and read-only operational analysis. The platform is designed to help operations teams understand what is happening across connected systems, investigate issues using authorized evidence, identify optimization or risk opportunities, and prepare governed next steps without silently changing production systems. CenOps is provider-agnostic: Genesys is one supported provider, not the definition of the platform. The product AI should answer this overview directly when asked about CenOps or “this platform,” even if no external provider is connected.`,
  },
  {
    topic: "How CenOps works",
    keywords: ["architecture", "workflow", "how cenops works", "how it works", "operational workspace", "investigation", "workflow", "process"],
    content: `CenOps separates product knowledge from tenant-specific live evidence. Product knowledge explains what CenOps features, agents and integrations are designed to do. Live evidence describes the actual connected providers, synchronized records, metrics, incidents and findings available to the current tenant and authorized department. The AI reasons across both layers, but must never present product catalog information as tenant evidence. A typical flow is: understand the request, identify relevant product knowledge and evidence, investigate authorized sources, correlate findings where supported, explain the result with source and confidence, then recommend a governed next step.`,
  },
  {
    topic: "CenOps integrations",
    keywords: ["integrations", "integration", "providers", "connect provider", "available integrations", "connected integrations", "catalog"],
    content: `CenOps uses a provider registry as the source of truth for product-level integration availability, authentication method, scopes and capabilities. The catalog currently includes available and coming-soon providers across contact center, cloud, productivity, ITSM/DevOps, CRM, collaboration, security, observability and data platforms. Product-level provider availability is different from tenant connection state: an available provider can be supported by CenOps while still being disconnected from the current tenant. The AI must clearly distinguish available, connected, disconnected, failed and coming-soon states.`,
  },
  {
    topic: "CenOps AI agents",
    keywords: ["agent", "ai agent", "agents", "configure agent", "use agent", "agent feature", "agent purpose"],
    content: `CenOps includes specialized agents such as License Optimization Agent, Cloud Optimization Agent, Security Agent, Incident Agent, Routing Agent, Workflow Agent and Knowledge Assistant. These agents are designed for focused operational outcomes: finding unused or over-provisioned entitlements, analyzing cloud spend and right-sizing, correlating security posture findings, triaging incidents, reviewing contact-routing health, coordinating governed workflows, and answering operational questions from authorized connected data. When describing an agent, explain its purpose, business value, evidence/data it can use, relevant provider bindings, configuration or instructions when known, expected workflow, and which actions remain approval-gated.`,
  },
  {
    topic: "CenOps investigations and evidence",
    keywords: ["evidence", "source", "audit", "approval", "governance", "read only", "permission", "department", "investigation", "audit trail", "correlation"],
    content: `CenOps investigations provide a governed trail of the request, evidence gathering, findings and response. Evidence is restricted to the caller's authorized department scope. The AI should distinguish product knowledge, provider catalog information, live provider evidence, agent evidence and derived correlations. Read-only analysis may explain findings and prepare recommendations, but a connected-system change must remain human-approved. If evidence is unavailable, stale or outside scope, CenOps should say so rather than fabricate a result.`,
  },
  {
    topic: "CenOps AI behavior",
    keywords: ["ai", "answer", "question", "learn", "self learn", "self train", "self heal", "hallucination", "accuracy", "copilot"],
    content: `CenOps Enterprise AI is a product expert and enterprise operations assistant. It should answer product questions from CenOps product knowledge, provider catalog definitions and agent definitions, and answer tenant-specific operational questions from authorized live evidence. It should not claim autonomous retraining or self-healing. Safe self-improvement means capturing feedback, identifying knowledge gaps, validating proposed knowledge updates, improving retrieval and surfacing governed remediation steps. Production changes and other consequential actions require human approval.`,
  },
  {
    topic: "CenOps terminology",
    keywords: ["aegis", "cenops name", "enterprise ai", "copilot", "branding"],
    content: `The product name is CenOps. Use “CenOps” in all user-facing responses. “CenOps Enterprise AI” or “CenOps AI” may be used to describe the assistant. Do not introduce or describe the product as Aegis. Legacy internal identifiers or repository names may still contain Aegis, but they are implementation details and must not leak into the user-facing product answer.`,
  },
];

export const CENOPS_AI_KNOWLEDGE: CenOpsKnowledgeEntry[] = [
  ...platformEntries,
  ...PROVIDER_REGISTRY.map(providerKnowledge),
];

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function retrieveCenOpsKnowledge(query: string, limit = 10): CenOpsKnowledgeEntry[] {
  const normalized = normalize(query);
  const terms = new Set(normalized.split(/\s+/).filter(Boolean));
  return CENOPS_AI_KNOWLEDGE
    .map((entry) => {
      const haystack = normalize(`${entry.topic} ${entry.content} ${entry.keywords.join(" ")}`);
      let score = 0;
      if (haystack.includes(normalized) && normalized.length > 3) score += 8;
      for (const keyword of entry.keywords) {
        const keyTerms = normalize(keyword).split(/\s+/);
        score += keyTerms.filter((term) => terms.has(term)).length * 3;
      }
      for (const term of terms) if (term.length > 3 && haystack.includes(term)) score += 1;
      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ entry }) => entry);
}

export function formatCenOpsKnowledge(query: string): string {
  const matches = retrieveCenOpsKnowledge(query);
  if (!matches.length) return "No specific CenOps product-knowledge match was found. Answer only from supplied evidence and explicitly state when the product knowledge does not establish a detail.";
  return matches.map((entry) => `### ${entry.topic}\n${entry.content}`).join("\n\n");
}

// Backward-compatible exports for the existing chat engine during the incremental rollout.
export type AegisKnowledgeEntry = CenOpsKnowledgeEntry;
export const AEGIS_AI_KNOWLEDGE = CENOPS_AI_KNOWLEDGE;
export function retrieveAegisKnowledge(query: string, limit = 10): CenOpsKnowledgeEntry[] {
  return retrieveCenOpsKnowledge(query, limit);
}
export function formatAegisKnowledge(query: string): string {
  return formatCenOpsKnowledge(query);
}
