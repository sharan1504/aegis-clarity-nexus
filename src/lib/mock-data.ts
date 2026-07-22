// Mock data layer for Aegis AI. Replace with REST/MCP calls when wiring backends.
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Cloud,
  ShieldCheck,
  Headphones,
  AlertOctagon,
  BookOpen,
  Workflow,
} from "lucide-react";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface Kpi {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "flat";
  hint?: string;
  breakdown?: string;
}

export const kpis: Kpi[] = [
  { label: "Platform Health", value: "97.4%", delta: "+0.6% vs yesterday", trend: "up", hint: "Rolling 24h" },
  { label: "Cost Savings (MTD)", value: "$284,120", delta: "+12.3% vs last month", trend: "up", hint: "Optimizations applied" },
  { label: "Active Incidents", value: "7", delta: "-2 vs yesterday", trend: "down", hint: "Open now", breakdown: "3 P1 · 4 P2" },
  { label: "Security Alerts", value: "23", delta: "+5 vs last week", trend: "up", hint: "Last 7 days", breakdown: "9 require review" },
];

export const healthTrend = [
  { t: "Mon", health: 95, cost: 210 },
  { t: "Tue", health: 96, cost: 232 },
  { t: "Wed", health: 94, cost: 220 },
  { t: "Thu", health: 97, cost: 245 },
  { t: "Fri", health: 96, cost: 260 },
  { t: "Sat", health: 98, cost: 268 },
  { t: "Sun", health: 97, cost: 284 },
];

export const costByCloud = [
  { name: "AWS", value: 128000 },
  { name: "Azure", value: 96500 },
  { name: "GCP", value: 34200 },
  { name: "SaaS", value: 62100 },
];

export const incidentsByService = [
  { name: "Genesys", p1: 1, p2: 2, p3: 4 },
  { name: "AWS", p1: 2, p2: 1, p3: 3 },
  { name: "Azure", p1: 0, p2: 1, p3: 5 },
  { name: "M365", p1: 0, p2: 0, p3: 2 },
  { name: "Salesforce", p1: 0, p2: 1, p3: 1 },
];

export interface Recommendation {
  id: string;
  title: string;
  impact: string;
  category: "Cost" | "Security" | "License" | "Performance" | "Compliance";
  severity: Severity;
  agent: string;
  status: "pending" | "approved" | "rejected" | "applied";
}

export const recommendations: Recommendation[] = [
  {
    id: "rec-001",
    title: "Reclaim 142 unused Microsoft 365 E5 licenses",
    impact: "$54,600 / yr",
    category: "License",
    severity: "high",
    agent: "License Optimization",
    status: "pending",
  },
  {
    id: "rec-002",
    title: "Right-size 38 over-provisioned EC2 instances (m5.4xlarge → m5.xlarge)",
    impact: "$18,400 / mo",
    category: "Cost",
    severity: "high",
    agent: "Cloud Cost Optimization",
    status: "pending",
  },
  {
    id: "rec-003",
    title: "Rotate 4 IAM access keys older than 180 days",
    impact: "Reduce breach risk",
    category: "Security",
    severity: "critical",
    agent: "Security & Compliance",
    status: "pending",
  },
  {
    id: "rec-004",
    title: "Increase Genesys agent capacity for peak 2–4pm EST window",
    impact: "-38s AHT, +6% CSAT",
    category: "Performance",
    severity: "medium",
    agent: "Contact Center Optimization",
    status: "pending",
  },
  {
    id: "rec-005",
    title: "Auto-close 27 stale ServiceNow incidents with no activity > 30d",
    impact: "Cleaner SLA metrics",
    category: "Compliance",
    severity: "low",
    agent: "Workflow Automation",
    status: "approved",
  },
];

export interface Incident {
  id: string;
  title: string;
  service: string;
  severity: Severity;
  status: "open" | "investigating" | "mitigated" | "resolved";
  owner: string;
  opened: string;
}

export const incidents: Incident[] = [
  { id: "INC-4821", title: "Genesys voice latency spike in EU-West", service: "Genesys Cloud", severity: "critical", status: "investigating", owner: "S. Nakamura", opened: "12m ago" },
  { id: "INC-4820", title: "Azure AD sign-in failures for finance group", service: "Azure", severity: "high", status: "open", owner: "M. Alvarez", opened: "38m ago" },
  { id: "INC-4818", title: "Salesforce API rate limit exceeded", service: "Salesforce", severity: "medium", status: "mitigated", owner: "R. Patel", opened: "2h ago" },
  { id: "INC-4815", title: "Slack notifications delayed > 90s", service: "Slack", severity: "low", status: "resolved", owner: "J. O'Neill", opened: "5h ago" },
  { id: "INC-4812", title: "AWS S3 bucket policy drift detected", service: "AWS", severity: "high", status: "open", owner: "L. Chen", opened: "6h ago" },
];

export interface Agent {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  status: "active" | "paused" | "beta";
  actionsThisWeek: number;
  savings: string;
  category: string;
}

export const agents: Agent[] = [
  {
    id: "agent-license",
    name: "License Optimization Agent",
    description: "Continuously audits SaaS + M365 licenses, flags unused seats, and rightsizes tiers.",
    icon: Activity,
    status: "active",
    actionsThisWeek: 42,
    savings: "$54.6K / yr",
    category: "FinOps",
  },
  {
    id: "agent-cost",
    name: "Cloud Cost Optimization Agent",
    description: "Analyzes AWS, Azure, and GCP spend to recommend rightsizing, RIs, and savings plans.",
    icon: Cloud,
    status: "active",
    actionsThisWeek: 87,
    savings: "$220K / yr",
    category: "FinOps",
  },
  {
    id: "agent-security",
    name: "Security & Compliance Agent",
    description: "Monitors IAM, config drift, and CIS benchmarks across all connected clouds.",
    icon: ShieldCheck,
    status: "active",
    actionsThisWeek: 118,
    savings: "12 findings closed",
    category: "Security",
  },
  {
    id: "agent-ccx",
    name: "Contact Center Optimization Agent",
    description: "Optimizes Genesys routing, staffing, and AHT using live queue telemetry.",
    icon: Headphones,
    status: "active",
    actionsThisWeek: 24,
    savings: "-38s AHT",
    category: "Operations",
  },
  {
    id: "agent-incident",
    name: "Incident Investigation Agent",
    description: "Correlates logs, metrics, and tickets to produce root-cause hypotheses in minutes.",
    icon: AlertOctagon,
    status: "active",
    actionsThisWeek: 61,
    savings: "-42% MTTR",
    category: "Operations",
  },
  {
    id: "agent-knowledge",
    name: "Knowledge Assistant",
    description: "Answers questions across Confluence, SharePoint, Jira, and ServiceNow KBs.",
    icon: BookOpen,
    status: "active",
    actionsThisWeek: 312,
    savings: "9.4K queries",
    category: "Productivity",
  },
  {
    id: "agent-workflow",
    name: "Workflow Automation Agent",
    description: "Executes multi-step approvals across Jira, ServiceNow, and Slack.",
    icon: Workflow,
    status: "active",
    actionsThisWeek: 156,
    savings: "1,240 hrs saved",
    category: "Automation",
  },
];

export interface Integration {
  id: string;
  name: string;
  category: string;
  description: string;
  status: "connected" | "available" | "action_required";
  auth: "OAuth 2.0" | "API Key" | "MCP" | "SAML";
  lastSync?: string;
  logo: string; // emoji for lightweight visual
}

export const integrations: Integration[] = [
  { id: "genesys", name: "Genesys Cloud", category: "Contact Center", description: "Voice, digital, and workforce engagement telemetry.", status: "connected", auth: "OAuth 2.0", lastSync: "2m ago", logo: "🎧" },
  { id: "aws", name: "AWS", category: "Cloud", description: "EC2, S3, IAM, Cost Explorer, CloudWatch.", status: "connected", auth: "OAuth 2.0", lastSync: "4m ago", logo: "☁️" },
  { id: "azure", name: "Microsoft Azure", category: "Cloud", description: "Resource graph, cost management, Defender.", status: "connected", auth: "OAuth 2.0", lastSync: "3m ago", logo: "🔷" },
  { id: "m365", name: "Microsoft 365", category: "Productivity", description: "Entra ID, licensing, Teams, Exchange.", status: "connected", auth: "OAuth 2.0", lastSync: "6m ago", logo: "🪟" },
  { id: "jira", name: "Jira", category: "ITSM", description: "Issues, sprints, and workflow automation.", status: "connected", auth: "OAuth 2.0", lastSync: "1m ago", logo: "🧩" },
  { id: "servicenow", name: "ServiceNow", category: "ITSM", description: "Incidents, changes, CMDB.", status: "action_required", auth: "OAuth 2.0", lastSync: "OAuth expired", logo: "🛎️" },
  { id: "salesforce", name: "Salesforce", category: "CRM", description: "Accounts, opportunities, cases, and platform events.", status: "connected", auth: "OAuth 2.0", lastSync: "9m ago", logo: "☁︎" },
  { id: "slack", name: "Slack", category: "Collaboration", description: "Channels, DMs, workflow triggers.", status: "connected", auth: "OAuth 2.0", lastSync: "1m ago", logo: "💬" },
  { id: "github", name: "GitHub", category: "DevOps", description: "Repos, actions, security advisories.", status: "available", auth: "OAuth 2.0", logo: "🐙" },
];

export interface Report {
  id: string;
  title: string;
  category: string;
  updated: string;
  owner: string;
}

export const reports: Report[] = [
  { id: "rep-lic", title: "Monthly License Utilization", category: "FinOps", updated: "Today", owner: "License Agent" },
  { id: "rep-cost", title: "Cloud Cost Executive Summary", category: "FinOps", updated: "Today", owner: "Cost Agent" },
  { id: "rep-sec", title: "Security Posture — CIS v2.0", category: "Security", updated: "Yesterday", owner: "Security Agent" },
  { id: "rep-ccx", title: "Contact Center KPIs (Weekly)", category: "Operations", updated: "2d ago", owner: "CCX Agent" },
  { id: "rep-inc", title: "Incident Trend & MTTR", category: "Operations", updated: "3d ago", owner: "Incident Agent" },
];

export interface User {
  id: string;
  name: string;
  email: string;
  role: "Admin" | "Manager" | "Analyst" | "Viewer";
  tenant: string;
  lastActive: string;
  status: "active" | "invited" | "disabled";
}

export const users: User[] = [
  { id: "u1", name: "Amelia Ward", email: "amelia.ward@contoso.com", role: "Admin", tenant: "Contoso", lastActive: "2m ago", status: "active" },
  { id: "u2", name: "Rahul Mehta", email: "rahul.mehta@contoso.com", role: "Manager", tenant: "Contoso", lastActive: "24m ago", status: "active" },
  { id: "u3", name: "Sofia Rossi", email: "sofia.rossi@contoso.com", role: "Analyst", tenant: "Contoso", lastActive: "1h ago", status: "active" },
  { id: "u4", name: "Diego Alvarez", email: "diego@acme.io", role: "Analyst", tenant: "Acme", lastActive: "3h ago", status: "active" },
  { id: "u5", name: "Kenji Watanabe", email: "kenji@acme.io", role: "Viewer", tenant: "Acme", lastActive: "1d ago", status: "invited" },
];

export const auditLog = [
  { ts: "10:42:11", actor: "amelia.ward", action: "Approved recommendation rec-002", target: "AWS" },
  { ts: "10:37:02", actor: "system", action: "OAuth token refreshed", target: "Genesys Cloud" },
  { ts: "10:14:55", actor: "rahul.mehta", action: "Invited user kenji@acme.io", target: "Users" },
  { ts: "09:58:20", actor: "security-agent", action: "Flagged IAM key age > 180d", target: "AWS" },
  { ts: "09:42:00", actor: "cost-agent", action: "Generated cost report", target: "Reports" },
];

export const chatSuggestions = [
  "Which Microsoft 365 licenses are unused?",
  "Why did AWS costs increase this week?",
  "Show me all SLA breaches in the last 24 hours.",
  "Investigate incident INC-4821.",
  "Create a Jira ticket for the Azure AD sign-in issue.",
  "Recommend cloud savings for our production workloads.",
];

export interface SecurityAlert {
  id: string;
  title: string;
  service: string;
  severity: Severity;
  status: "new" | "reviewing" | "acknowledged";
  detected: string;
}

export const securityAlerts: SecurityAlert[] = [
  { id: "SEC-2201", title: "IAM access key age > 180d (4 keys)", service: "AWS", severity: "critical", status: "new", detected: "8m ago" },
  { id: "SEC-2199", title: "Public S3 bucket policy on log-archive", service: "AWS", severity: "high", status: "reviewing", detected: "42m ago" },
  { id: "SEC-2198", title: "Guest user with Global Admin retained MFA bypass", service: "Entra ID", severity: "critical", status: "new", detected: "1h ago" },
  { id: "SEC-2195", title: "OAuth app requesting Mail.ReadWrite for all users", service: "M365", severity: "high", status: "new", detected: "3h ago" },
  { id: "SEC-2190", title: "Unusual API call pattern from ap-south-1", service: "AWS", severity: "medium", status: "reviewing", detected: "5h ago" },
  { id: "SEC-2187", title: "ServiceNow admin login from unrecognized geo", service: "ServiceNow", severity: "high", status: "new", detected: "7h ago" },
  { id: "SEC-2185", title: "Weak TLS ciphers on legacy load balancer", service: "AWS", severity: "medium", status: "acknowledged", detected: "12h ago" },
  { id: "SEC-2180", title: "Slack workflow with external webhook missing sig verify", service: "Slack", severity: "medium", status: "reviewing", detected: "1d ago" },
  { id: "SEC-2177", title: "Salesforce API user token unused 45d", service: "Salesforce", severity: "low", status: "acknowledged", detected: "1d ago" },
];

export interface AgentFinding {
  id: string;
  title: string;
  detected: string;
  severity: Severity;
  impact: string;
}

export const agentFindings: Record<string, AgentFinding[]> = {
  "agent-license": [
    { id: "F-L001", title: "142 M365 E5 seats inactive > 90d", detected: "2h ago", severity: "high", impact: "$54.6K / yr" },
    { id: "F-L002", title: "Salesforce Sales Cloud: 18 seats downgradable to Platform", detected: "6h ago", severity: "medium", impact: "$21.6K / yr" },
    { id: "F-L003", title: "Zoom Pro seats duplicated with Teams Phone (26 users)", detected: "1d ago", severity: "medium", impact: "$4.2K / yr" },
  ],
  "agent-cost": [
    { id: "F-C001", title: "38 EC2 m5.4xlarge under 15% CPU for 30d", detected: "1h ago", severity: "high", impact: "$18.4K / mo" },
    { id: "F-C002", title: "RI coverage on RDS 62% — increase to 88%", detected: "4h ago", severity: "medium", impact: "$7.9K / mo" },
    { id: "F-C003", title: "14 orphaned EBS volumes across 3 regions", detected: "1d ago", severity: "low", impact: "$1.1K / mo" },
  ],
  "agent-security": [
    { id: "F-S001", title: "4 IAM keys older than 180d in prod account", detected: "8m ago", severity: "critical", impact: "Breach risk" },
    { id: "F-S002", title: "Public S3 bucket policy detected on log-archive", detected: "42m ago", severity: "high", impact: "Data exposure" },
    { id: "F-S003", title: "Guest user retained Global Admin role", detected: "1h ago", severity: "critical", impact: "Privilege risk" },
  ],
  "agent-ccx": [
    { id: "F-X001", title: "EU-West peak 2–4pm EST understaffed by 6 agents", detected: "30m ago", severity: "medium", impact: "-38s AHT" },
    { id: "F-X002", title: "Callback routing misconfigured for tier-2 tech", detected: "3h ago", severity: "low", impact: "+2% CSAT" },
  ],
  "agent-incident": [
    { id: "F-I001", title: "Correlated INC-4821 to ExpressRoute path change 08:14 UTC", detected: "12m ago", severity: "critical", impact: "MTTR -34m" },
    { id: "F-I002", title: "INC-4820 root cause: Azure AD conditional access policy drift", detected: "38m ago", severity: "high", impact: "MTTR -18m" },
  ],
  "agent-knowledge": [
    { id: "F-K001", title: "Confluence page 'VPN onboarding' outdated — 312 queries this week", detected: "2h ago", severity: "low", impact: "Deflection +12%" },
  ],
  "agent-workflow": [
    { id: "F-W001", title: "27 stale ServiceNow incidents auto-closable (>30d idle)", detected: "1h ago", severity: "low", impact: "Cleaner SLA" },
    { id: "F-W002", title: "Jira → Slack escalation missing for P1 outages", detected: "5h ago", severity: "medium", impact: "MTTR -8m" },
  ],
};

export interface ApprovalDetail {
  rationale: string;
  dataSources: string[];
  rollback: string;
  notify: string[];
}

export const approvalDetails: Record<string, ApprovalDetail> = {
  "rec-001": {
    rationale: "142 M365 E5 licenses have had no sign-in in >90d (Entra ID sign-in logs + license assignment API).",
    dataSources: ["Entra ID sign-in logs", "M365 license assignment API", "HR active-employee roster"],
    rollback: "Licenses are downgraded — not deleted. Re-assign from admin center within 30d, no data loss.",
    notify: ["IT license owners", "Direct managers of affected users", "#it-licensing Slack"],
  },
  "rec-002": {
    rationale: "38 m5.4xlarge instances averaged <15% CPU and <30% memory over the last 30 days.",
    dataSources: ["CloudWatch metrics (30d)", "AWS Cost Explorer", "Compute Optimizer recommendations"],
    rollback: "Rightsizing is scheduled via ASG rolling refresh. Roll back by reverting launch template version.",
    notify: ["Cloud platform team", "Application owners (tag: owner)", "#cloud-finops Slack"],
  },
  "rec-003": {
    rationale: "4 IAM access keys have not been rotated in >180 days and are attached to elevated policies.",
    dataSources: ["AWS IAM credential report", "CloudTrail last-used timestamps"],
    rollback: "New keys are generated first; old keys deactivated (not deleted) for 7d before removal.",
    notify: ["Key owners via email", "Security on-call", "#security-alerts Slack"],
  },
  "rec-004": {
    rationale: "Historical queue telemetry shows 2–4pm EST peak with abandon rate >8%; 6 additional agents needed.",
    dataSources: ["Genesys queue telemetry (90d)", "WFM forecast", "Historical CSAT survey data"],
    rollback: "Staffing template revert; changes are scheduled, not applied to live shifts.",
    notify: ["Contact center supervisors", "WFM team"],
  },
  "rec-005": {
    rationale: "27 ServiceNow incidents have had no activity for >30 days and are in resolved-adjacent states.",
    dataSources: ["ServiceNow incident table", "Activity stream"],
    rollback: "Tickets are closed with resolution note; reopen from ServiceNow UI at any time.",
    notify: ["Ticket assignees", "#servicenow-ops Slack"],
  },
};
