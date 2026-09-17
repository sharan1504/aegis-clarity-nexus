import type { LucideIcon } from "lucide-react";
import { Activity, Bot, FileBarChart, GitBranch, Search, ShieldCheck, Users, Zap } from "lucide-react";

export type AnalyticsViewId =
  | "overview"
  | "ai-usage"
  | "agents"
  | "governance"
  | "admin-activity"
  | "integrations-evidence"
  | "findings"
  | "reports";

type WorkspaceGroup = "Overview" | "AI Operations" | "Agents" | "Governance" | "Administration";

export type AnalyticsViewDefinition = {
  id: AnalyticsViewId;
  label: string;
  description: string;
  group: WorkspaceGroup | "Integrations evidence" | "Findings" | "Reports";
  icon: LucideIcon;
};

export const ANALYTICS_VIEWS: AnalyticsViewDefinition[] = [
  { id: "overview", label: "Control plane summary", description: "Evidence-backed platform activity, change volume and operating signals.", group: "Overview", icon: Activity },
  { id: "ai-usage", label: "AI usage", description: "Recorded model requests, tokens, cost estimates and latency.", group: "AI Operations", icon: Bot },
  { id: "agents", label: "Agent performance", description: "Agent activity joined from the global agent catalogue and tenant evidence.", group: "Agents", icon: Zap },
  { id: "governance", label: "Change pipeline", description: "Change records by stage, severity and risk with approval hand-offs.", group: "Governance", icon: ShieldCheck },
  { id: "admin-activity", label: "User activity", description: "Recorded additions, removals, updates and active actors.", group: "Administration", icon: Users },
  { id: "integrations-evidence", label: "Integrations evidence", description: "Connected providers, synchronized records and recent sync outcomes.", group: "Integrations evidence", icon: GitBranch },
  { id: "findings", label: "Operational findings", description: "Findings derived only from changes, AI activity and audit evidence.", group: "Findings", icon: Search },
  { id: "reports", label: "Reports", description: "Analytics report templates, generated history and retention settings.", group: "Reports", icon: FileBarChart },
];

export const ANALYTICS_VIEW_GROUPS = ["Overview", "AI Operations", "Agents", "Governance", "Administration", "Integrations evidence", "Findings", "Reports"] as const;

export function getAnalyticsView(value: unknown): AnalyticsViewId {
  return ANALYTICS_VIEWS.some((view) => view.id === value) ? value as AnalyticsViewId : "overview";
}
