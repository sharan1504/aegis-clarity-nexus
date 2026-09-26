export type OnboardingFeatureKey =
  | "command-center"
  | "integrations"
  | "agents"
  | "copilot";

export type TourStep = {
  id: "welcome" | OnboardingFeatureKey;
  title: string;
  description: string;
  cta: string;
  route?: string;
  helpTopic?: string;
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to CenOps",
    description:
      "CenOps brings operational evidence, AI agents, integrations, and governance into one control plane. You are in Demo mode, so you can explore the workflow safely without contacting external providers.",
    cta: "Start exploring",
  },
  {
    id: "command-center",
    title: "Command Center",
    description:
      "Start here for the operational picture: findings, provider-backed signals, approvals, changes, and current posture. It is the best place to understand what needs attention.",
    cta: "Open Command Center",
    route: "/",
    helpTopic: "command-center",
  },
  {
    id: "integrations",
    title: "Integrations",
    description:
      "Integrations connect CenOps to the systems your teams already use. Demo shows the catalog and workflow; Live requires real provider authorization and synchronization.",
    cta: "View Integrations",
    route: "/integrations",
    helpTopic: "integrations",
  },
  {
    id: "agents",
    title: "AI Agents",
    description:
      "Agents turn governed evidence into repeatable analysis and actions. Their runtime is constrained by tenant scope, capabilities, provider bindings, approvals, and guardrails.",
    cta: "Explore AI Agents",
    route: "/agents",
    helpTopic: "ai-agents",
  },
  {
    id: "copilot",
    title: "CenOps Copilot",
    description:
      "Copilot is the natural-language entry point. Ask what CenOps can do, explore a feature, investigate demo evidence, or learn what a real integration would enable.",
    cta: "Try Copilot",
    route: "/chat",
    helpTopic: "copilot",
  },
];

export const DISCOVERY_FEATURES: Array<{
  key: OnboardingFeatureKey;
  label: string;
  route: string;
  helpTopic: string;
}> = [
  { key: "command-center", label: "Explore Command Center", route: "/", helpTopic: "command-center" },
  { key: "copilot", label: "Try Copilot", route: "/chat", helpTopic: "copilot" },
  { key: "agents", label: "Explore an AI Agent", route: "/agents", helpTopic: "ai-agents" },
  { key: "integrations", label: "View Integrations", route: "/integrations", helpTopic: "integrations" },
];

export const FEATURE_HELP_BY_PATH: Record<string, string> = {
  "/": "command-center",
  "/chat": "copilot",
  "/analytics": "analytics-reports",
  "/analytics/workspace": "analytics-reports",
  "/agents": "ai-agents",
  "/integrations": "integrations",
  "/governance": "governance",
};

export const ONBOARDING_VISIT_PATHS: Record<string, OnboardingFeatureKey> = {
  "/": "command-center",
  "/chat": "copilot",
  "/agents": "agents",
  "/integrations": "integrations",
};
