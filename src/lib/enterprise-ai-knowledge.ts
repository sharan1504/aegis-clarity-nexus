import { PROVIDER_REGISTRY, type ProviderDefinition } from "@/lib/integrations/provider-registry";

export interface AegisKnowledgeEntry {
  topic: string;
  content: string;
  keywords: string[];
}

const providerKnowledge = (provider: ProviderDefinition): AegisKnowledgeEntry => ({
  topic: `${provider.name} integration`,
  keywords: [provider.id, provider.name.toLowerCase(), "integration", "connect", "configure", "setup", "sync", "authentication"],
  content: [
    `${provider.name} is an ${provider.availability === "available" ? "available" : "upcoming"} provider in the Aegis Integrations catalog.`,
    `Category: ${provider.category}. ${provider.description}`,
    `Authentication: ${provider.auth}. Aegis declares these scopes/capabilities: ${provider.scopes.join(", ")}; capabilities: ${provider.capabilities.join(", ")}.`,
    provider.availability === "available"
      ? `Connection guidance: 1) Open Integrations. 2) Select ${provider.name}. 3) Choose the connection method shown by Aegis (${provider.auth}). 4) Grant only the requested permissions/credentials. 5) Complete the provider authorization or credential validation. 6) Confirm the connection appears as Connected. 7) Run or wait for the provider sync before asking Aegis about provider-specific data. 8) If the connection fails, review the integration error and credential/permission requirements rather than assuming the provider is unavailable.`
      : `Connection guidance: ${provider.name} is currently marked coming soon in the Aegis provider registry, so users should not be told that a live connection can be completed yet.`,
  ].join("\n"),
});

const platformEntries: AegisKnowledgeEntry[] = [
  {
    topic: "Aegis platform",
    keywords: ["aegis", "platform", "what is this", "what does this do", "features", "how does it work", "help"],
    content: `Aegis is an enterprise operations platform that brings connected business and technology systems into one governed operational workspace. The platform exposes integrations, synchronized provider evidence, AI agents, investigations, recommendations, approvals, auditability and read-only operational analysis. The AI should explain product capabilities, guide users through supported workflows, distinguish live connected data from demo evidence, and never invent a connection, metric, capability or completed action.`,
  },
  {
    topic: "Integrations",
    keywords: ["integrations", "integration", "providers", "connect provider", "available integrations", "connected integrations"],
    content: `Aegis uses a provider registry for integrations. Each provider has a name, category, description, authentication method, scopes, capabilities and availability state. The current catalog should be treated as the source of truth for what Aegis presents. The AI must describe a provider generically and only claim it is connected when live tenant evidence says so. It should explain the difference between available, connected, failed, disconnected and coming-soon states.`,
  },
  {
    topic: "AI agents",
    keywords: ["agent", "ai agent", "agents", "configure agent", "use agent", "agent feature"],
    content: `Aegis includes specialized agents such as License Optimization Agent, Cloud Optimization Agent, Security Agent, Incident Agent, Routing Agent, Workflow Agent and Knowledge Assistant. Agents are intended to analyze authorized evidence and prepare governed operational outcomes. Agent guidance should cover what the agent does, the business value, required provider/capability bindings, what evidence it can use, what configuration is needed, and whether an action requires human approval.`,
  },
  {
    topic: "AI behavior and safety",
    keywords: ["ai", "answer", "question", "learn", "self learn", "self train", "self heal", "hallucination", "accuracy"],
    content: `Enterprise AI should answer product and operational questions using the Aegis product knowledge plus authorized live workspace evidence. Product knowledge may explain features and workflows even when no provider is connected. Live-data claims require live evidence. Aegis should not claim that it has autonomously retrained itself or healed a provider. Instead, self-improvement should mean capturing feedback, identifying unanswered questions, validating answers against product definitions and integration state, and surfacing safe remediation or configuration steps for human approval.`,
  },
  {
    topic: "Evidence and governance",
    keywords: ["evidence", "source", "audit", "approval", "governance", "read only", "permission", "department"],
    content: `Aegis AI operates within the caller's authorized department scope. It should cite the relevant source category, distinguish synchronized provider evidence from product knowledge, report uncertainty when evidence is unavailable or stale, and require human approval before recommending that a connected system be changed. It must never infer that an integration is connected merely because the provider exists in the catalog.`,
  },
];

export const AEGIS_AI_KNOWLEDGE: AegisKnowledgeEntry[] = [
  ...platformEntries,
  ...PROVIDER_REGISTRY.map(providerKnowledge),
];

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function retrieveAegisKnowledge(query: string, limit = 8): AegisKnowledgeEntry[] {
  const normalized = normalize(query);
  const terms = new Set(normalized.split(/\s+/).filter(Boolean));
  return AEGIS_AI_KNOWLEDGE
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

export function formatAegisKnowledge(query: string): string {
  const matches = retrieveAegisKnowledge(query);
  if (!matches.length) return "No specific product-knowledge match was found. Answer from the supplied live evidence only, and explicitly say when the platform documentation does not establish a detail.";
  return matches.map((entry) => `### ${entry.topic}\n${entry.content}`).join("\n\n");
}
