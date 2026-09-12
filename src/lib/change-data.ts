// Change Control Center mock data — enterprise change management records.
import type { Severity } from "./mock-data";

export type ChangeStage =
  | "Proposed"
  | "Owner Review"
  | "Change Created"
  | "Team Approvals"
  | "Ready to Execute"
  | "Executed";

export const CHANGE_STAGES: ChangeStage[] = [
  "Proposed",
  "Owner Review",
  "Change Created",
  "Team Approvals",
  "Ready to Execute",
  "Executed",
];

export type ExecutionMode = "Manual" | "Assisted" | "Automatic";
export type RiskTier = "Low" | "Medium" | "High" | "Critical";

export interface ChangeApproval {
  /** DB row id when the record is loaded from Lovable Cloud. */
  rowId?: string;
  team: string;
  approver: string;
  role: string;
  status: "pending" | "approved" | "rejected";
  timestamp?: string;
  comment?: string;
}

export interface ChangeTimelineEvent {
  ts: string;
  actor: string;
  kind: "status" | "comment" | "action" | "system";
  text: string;
}

export interface ChangeAuditEntry {
  ts: string;
  actor: string;
  action: string;
  hash: string;
}

export interface ExternalTicket {
  system: "ServiceNow" | "Jira" | "Salesforce" | "PagerDuty";
  id: string;
  url: string;
}

export interface ValidationCheck {
  name: string;
  status: "passed" | "warning" | "failed";
  detail: string;
}

export interface ChangeRecord {
  /** DB row id (uuid) when the record is loaded from Lovable Cloud. */
  rowId?: string;
  id: string;                      // e.g., CHG0012345
  title: string;
  stage: ChangeStage;
  severity: Severity;
  risk: { tier: RiskTier; score: number; factors: string[] };
  executionMode: ExecutionMode;
  ownerTeam: string;
  requester: string;
  category: string;
  agent: string;
  window: { start: string; end: string; inMaintenance: boolean };
  businessImpact: string;
  aiReasoning: string;
  approvals: ChangeApproval[];
  rollbackSteps: string[];
  validations: ValidationCheck[];
  externalTickets: ExternalTicket[];
  timeline: ChangeTimelineEvent[];
  audit: ChangeAuditEntry[];
  createdAt: string;
  /** True when the record comes from bundled demo fixtures rather than the change_records table. */
  demo?: boolean;
}

export const changeRecords: ChangeRecord[] = [
  {
    id: "CHG0012345",
    title: "Reclaim 142 unused Microsoft 365 E5 licenses",
    stage: "Team Approvals",
    severity: "high",
    risk: {
      tier: "Medium",
      score: 42,
      factors: [
        "Production identity system (Entra ID)",
        "Reversible within 30 days",
        "Low blast radius — affects 142 users, 0.4% of tenant",
        "No service dependency chains detected",
      ],
    },
    executionMode: "Assisted",
    ownerTeam: "IT Licensing Operations",
    requester: "License Optimization Agent",
    category: "License",
    agent: "License Optimization",
    window: {
      start: "2026-07-28 22:00 UTC",
      end: "2026-07-28 23:00 UTC",
      inMaintenance: true,
    },
    businessImpact:
      "Affects 142 Microsoft 365 E5 seats across Sales and Marketing. No service disruption expected — users retain E3 licensing during transition. Projected savings: $54,600/yr.",
    aiReasoning:
      "Cross-referenced Entra ID sign-in logs (90d), M365 license assignment API, and HR active-employee roster. 142 seats show zero sign-in activity in the last 90 days and no scheduled leave. All 142 users retain baseline E3 access via a fallback license pool, so mail, Teams, and OneDrive continue uninterrupted. Compute Optimizer confirms no dependency on E5-only features (advanced eDiscovery, Defender for O365 P2) for these accounts.",
    approvals: [
      { team: "IT Licensing Ops", approver: "Amelia Ward", role: "Director, IT Ops", status: "approved", timestamp: "2026-07-25 14:22 UTC", comment: "Confirmed with finance — proceed." },
      { team: "Finance / FinOps", approver: "Rahul Mehta", role: "FinOps Manager", status: "approved", timestamp: "2026-07-25 15:08 UTC", comment: "Savings tracked to Q3 target." },
      { team: "Information Security", approver: "Sofia Rossi", role: "Sec. Analyst", status: "pending" },
    ],
    rollbackSteps: [
      "Re-assign E5 SKU from M365 Admin Center → Licenses → Assigned licenses.",
      "Trigger Entra ID group membership sync (`Sync-MgLicense`) to restore add-ons within 15 min.",
      "Notify affected user via templated email; ticket auto-updates on ServiceNow CHG record.",
      "Rollback window: 30 days. After 30d, license is released to pool and requires new procurement.",
    ],
    validations: [
      { name: "Dependency check", status: "passed", detail: "No conditional access policies scoped to E5-only groups." },
      { name: "Conflict check", status: "passed", detail: "No overlapping changes in this maintenance window." },
      { name: "Budget check", status: "passed", detail: "Change is cost-negative; no procurement approval required." },
      { name: "Compliance check", status: "warning", detail: "3 users are in the SOX-scope group — review recommended before execution." },
    ],
    externalTickets: [
      { system: "ServiceNow", id: "CHG0012345", url: "#" },
      { system: "Jira", id: "ITOPS-4821", url: "#" },
    ],
    timeline: [
      { ts: "2026-07-25 09:14 UTC", actor: "License Optimization Agent", kind: "system", text: "Change proposed based on 90d inactivity scan." },
      { ts: "2026-07-25 09:14 UTC", actor: "system", kind: "status", text: "Stage → Owner Review" },
      { ts: "2026-07-25 11:02 UTC", actor: "amelia.ward", kind: "comment", text: "Owner review: coverage confirmed via HR roster." },
      { ts: "2026-07-25 12:40 UTC", actor: "system", kind: "status", text: "Stage → Change Created (CHG0012345)" },
      { ts: "2026-07-25 14:22 UTC", actor: "amelia.ward", kind: "action", text: "Approved as IT Licensing Ops owner." },
      { ts: "2026-07-25 15:08 UTC", actor: "rahul.mehta", kind: "action", text: "Approved as FinOps." },
    ],
    audit: [
      { ts: "2026-07-25 09:14:02 UTC", actor: "svc-license-agent", action: "CREATE change_record", hash: "a1f4…9c02" },
      { ts: "2026-07-25 14:22:11 UTC", actor: "amelia.ward", action: "APPROVE approval_step[1]", hash: "b7e2…5d19" },
      { ts: "2026-07-25 15:08:44 UTC", actor: "rahul.mehta", action: "APPROVE approval_step[2]", hash: "3c88…af71" },
    ],
    createdAt: "2026-07-25 09:14 UTC",
  },
  {
    id: "CHG0012346",
    title: "Right-size 38 over-provisioned EC2 instances (m5.4xlarge → m5.xlarge)",
    stage: "Owner Review",
    severity: "high",
    risk: {
      tier: "Medium",
      score: 51,
      factors: [
        "Production compute — customer-facing workloads",
        "Reversible via ASG launch-template rollback (<10 min)",
        "38 instances across 3 AZs — moderate blast radius",
        "Load-tested at 4× current peak on target size",
      ],
    },
    executionMode: "Manual",
    ownerTeam: "Cloud Platform Engineering",
    requester: "Cloud Cost Optimization Agent",
    category: "Cost",
    agent: "Cloud Cost Optimization",
    window: {
      start: "2026-07-30 02:00 UTC",
      end: "2026-07-30 04:00 UTC",
      inMaintenance: true,
    },
    businessImpact:
      "Right-sizes 38 EC2 instances powering the order-processing tier. Rolling refresh during standard maintenance window; no downtime expected. Projected savings: $18,400/mo ($220K/yr).",
    aiReasoning:
      "CloudWatch 30-day metrics show sustained CPU averaging 12% (p95: 24%), memory averaging 24% (p95: 41%). AWS Compute Optimizer classifies all 38 instances as 'Over-provisioned' with high confidence. Load tests on m5.xlarge against replayed peak traffic (Black Friday 2025) sustained p99 latency <180ms, well within SLO of 400ms. No noisy-neighbor risk identified — dedicated ENIs and EBS-optimized throughput remain within m5.xlarge limits.",
    approvals: [
      { team: "Cloud Platform Eng", approver: "Liu Chen", role: "Principal SRE", status: "pending" },
      { team: "Application Owners", approver: "M. Alvarez", role: "Eng Manager, Orders", status: "pending" },
      { team: "Finance / FinOps", approver: "Rahul Mehta", role: "FinOps Manager", status: "pending" },
    ],
    rollbackSteps: [
      "Revert ASG launch template to version 47 (m5.4xlarge).",
      "Trigger ASG instance refresh with min-healthy 90%.",
      "Monitor CloudWatch dashboard `orders-tier-health` for 30 min.",
      "If rollback triggered during exec: automatic — health-check failures roll instances back before promotion.",
    ],
    validations: [
      { name: "Dependency check", status: "passed", detail: "No downstream services pinned to instance type." },
      { name: "Conflict check", status: "passed", detail: "No RDS or ElastiCache maintenance overlapping window." },
      { name: "Load-test artifact", status: "passed", detail: "gatling-run-2026-07-22 passed p99 SLO on m5.xlarge." },
      { name: "Reserved instance impact", status: "warning", detail: "12 of 38 instances are covered by expiring RIs — coordinate with FinOps." },
    ],
    externalTickets: [
      { system: "ServiceNow", id: "CHG0012346", url: "#" },
      { system: "Jira", id: "CLOUD-9021", url: "#" },
    ],
    timeline: [
      { ts: "2026-07-25 08:02 UTC", actor: "Cloud Cost Optimization Agent", kind: "system", text: "Change proposed." },
      { ts: "2026-07-25 08:02 UTC", actor: "system", kind: "status", text: "Stage → Owner Review" },
      { ts: "2026-07-25 09:45 UTC", actor: "liu.chen", kind: "comment", text: "Requesting extended load-test evidence before approving." },
    ],
    audit: [
      { ts: "2026-07-25 08:02:14 UTC", actor: "svc-cost-agent", action: "CREATE change_record", hash: "f21c…7b0e" },
      { ts: "2026-07-25 09:45:33 UTC", actor: "liu.chen", action: "COMMENT approval_step[1]", hash: "8ae0…1f22" },
    ],
    createdAt: "2026-07-25 08:02 UTC",
  },
  {
    id: "CHG0012347",
    title: "Rotate 4 IAM access keys older than 180 days",
    stage: "Ready to Execute",
    severity: "critical",
    risk: {
      tier: "High",
      score: 68,
      factors: [
        "Production IAM — elevated policies attached",
        "Zero-downtime rotation with 7d dual-key overlap",
        "4 keys across 3 service accounts",
        "Owners identified and pre-notified",
      ],
    },
    executionMode: "Automatic",
    ownerTeam: "Information Security",
    requester: "Security & Compliance Agent",
    category: "Security",
    agent: "Security & Compliance",
    window: {
      start: "2026-07-26 06:00 UTC",
      end: "2026-07-26 06:30 UTC",
      inMaintenance: false,
    },
    businessImpact:
      "Rotates 4 long-lived IAM access keys attached to elevated policies. Reduces credential-theft blast radius. Dual-key overlap guarantees zero service disruption. Fully auditable via CloudTrail.",
    aiReasoning:
      "AWS IAM credential report shows 4 keys aged 187–241 days. CloudTrail last-used timestamps confirm all keys remain in active use — deletion without rotation would break production. Keys are attached to policies `PowerUserAccess` and a custom `DataPipelineWriter` policy (both elevated). Rotation follows CIS AWS Benchmark v2.0 §1.14 (90-day maximum). New keys are provisioned in Secrets Manager and old keys deactivated (not deleted) for a 7-day overlap.",
    approvals: [
      { team: "Information Security", approver: "Sofia Rossi", role: "Sec. Analyst", status: "approved", timestamp: "2026-07-24 11:04 UTC", comment: "Aligned with CIS §1.14." },
      { team: "Cloud Platform Eng", approver: "Liu Chen", role: "Principal SRE", status: "approved", timestamp: "2026-07-24 13:22 UTC" },
      { team: "Application Owners", approver: "Data Pipeline Team", role: "Team lead", status: "approved", timestamp: "2026-07-24 15:00 UTC", comment: "Secrets Manager consumers refreshed on-demand." },
    ],
    rollbackSteps: [
      "Old keys remain deactivated (not deleted) for 7 days.",
      "To roll back: `aws iam update-access-key --status Active --access-key-id <old>`.",
      "Update Secrets Manager rotation lambda to previous version.",
      "Notify consumers via #security-alerts Slack channel.",
    ],
    validations: [
      { name: "Dependency check", status: "passed", detail: "All consumers use Secrets Manager (no hardcoded keys detected via GitHub scan)." },
      { name: "Conflict check", status: "passed", detail: "No overlapping IAM changes." },
      { name: "Consumer readiness", status: "passed", detail: "All 6 consumer services confirmed Secrets Manager integration." },
    ],
    externalTickets: [
      { system: "ServiceNow", id: "CHG0012347", url: "#" },
      { system: "Jira", id: "SEC-7714", url: "#" },
      { system: "PagerDuty", id: "P-2X9F1A", url: "#" },
    ],
    timeline: [
      { ts: "2026-07-24 08:00 UTC", actor: "Security & Compliance Agent", kind: "system", text: "Change proposed (CIS §1.14 breach)." },
      { ts: "2026-07-24 11:04 UTC", actor: "sofia.rossi", kind: "action", text: "Approved as Information Security." },
      { ts: "2026-07-24 13:22 UTC", actor: "liu.chen", kind: "action", text: "Approved as Cloud Platform." },
      { ts: "2026-07-24 15:00 UTC", actor: "data-pipeline-team", kind: "action", text: "Approved as Application Owner." },
      { ts: "2026-07-24 15:01 UTC", actor: "system", kind: "status", text: "Stage → Ready to Execute" },
    ],
    audit: [
      { ts: "2026-07-24 08:00:11 UTC", actor: "svc-sec-agent", action: "CREATE change_record", hash: "e0aa…4402" },
      { ts: "2026-07-24 11:04:29 UTC", actor: "sofia.rossi", action: "APPROVE approval_step[1]", hash: "9d31…7c88" },
      { ts: "2026-07-24 13:22:07 UTC", actor: "liu.chen", action: "APPROVE approval_step[2]", hash: "1a02…ee54" },
      { ts: "2026-07-24 15:00:52 UTC", actor: "data-pipeline-team", action: "APPROVE approval_step[3]", hash: "72f4…b0c1" },
    ],
    createdAt: "2026-07-24 08:00 UTC",
  },
  {
    id: "CHG0012348",
    title: "Increase Genesys agent capacity for peak 2–4pm EST window",
    stage: "Proposed",
    severity: "medium",
    risk: {
      tier: "Low",
      score: 18,
      factors: [
        "Staffing template change — no infrastructure impact",
        "Scheduled, not live — reversible before shift start",
        "Affects 1 queue (Tier-1 English)",
        "Historical forecast confidence 92%",
      ],
    },
    executionMode: "Manual",
    ownerTeam: "Contact Center Operations",
    requester: "Contact Center Optimization Agent",
    category: "Performance",
    agent: "Contact Center Optimization",
    window: {
      start: "2026-07-29 18:00 UTC",
      end: "2026-07-29 20:00 UTC",
      inMaintenance: false,
    },
    businessImpact:
      "Adds 6 agents to the 2–4pm EST Tier-1 English queue. Expected impact: −38s AHT, +6% CSAT, abandon rate <3%.",
    aiReasoning:
      "Genesys queue telemetry (90d) shows abandon rate averaging 8.4% during 2–4pm EST, well above 3% SLO. WFM forecast projects the queue is short 6 agents at peak. Historical CSAT survey data correlates abandon rate with a −6 pt CSAT drop during understaffed windows.",
    approvals: [
      { team: "Contact Center Ops", approver: "R. Patel", role: "CCX Supervisor", status: "pending" },
      { team: "WFM Team", approver: "J. O'Neill", role: "WFM Analyst", status: "pending" },
    ],
    rollbackSteps: [
      "Revert staffing template in Genesys WFM to version 12.",
      "Notify supervisors via #ccx-ops Slack.",
      "No live impact — reversal completes before shift start.",
    ],
    validations: [
      { name: "Dependency check", status: "passed", detail: "No conflicting scheduled changes." },
      { name: "Forecast confidence", status: "passed", detail: "WFM confidence 92%." },
    ],
    externalTickets: [{ system: "ServiceNow", id: "CHG0012348", url: "#" }],
    timeline: [
      { ts: "2026-07-25 12:12 UTC", actor: "Contact Center Optimization Agent", kind: "system", text: "Change proposed." },
    ],
    audit: [
      { ts: "2026-07-25 12:12:03 UTC", actor: "svc-ccx-agent", action: "CREATE change_record", hash: "5c9f…21d3" },
    ],
    createdAt: "2026-07-25 12:12 UTC",
  },
  {
    id: "CHG0012340",
    title: "Auto-close 27 stale ServiceNow incidents",
    stage: "Executed",
    severity: "low",
    risk: {
      tier: "Low",
      score: 8,
      factors: [
        "Reversible — reopen from ServiceNow UI",
        "No infrastructure impact",
        "Idle >30d, resolved-adjacent state",
      ],
    },
    executionMode: "Automatic",
    ownerTeam: "IT Service Management",
    requester: "Workflow Automation Agent",
    category: "Compliance",
    agent: "Workflow Automation",
    window: {
      start: "2026-07-22 03:00 UTC",
      end: "2026-07-22 03:15 UTC",
      inMaintenance: true,
    },
    businessImpact: "Cleans up 27 stale incidents. Improves SLA metrics accuracy. Fully reversible from ServiceNow UI.",
    aiReasoning:
      "27 incidents idle 32–61 days in resolved-adjacent states (Awaiting User Info, Resolved-Not-Confirmed). ServiceNow activity stream shows no assignee or requester activity beyond 30d threshold defined in SOP-ITSM-014.",
    approvals: [
      { team: "IT Service Management", approver: "Amelia Ward", role: "Director, IT Ops", status: "approved", timestamp: "2026-07-21 10:00 UTC" },
    ],
    rollbackSteps: [
      "Reopen from ServiceNow UI: Incident → Reopen (available for 30d).",
      "Resolution note preserved: 'Auto-closed by Aegis — no activity 30d+'.",
    ],
    validations: [
      { name: "Dependency check", status: "passed", detail: "No linked change or problem records." },
      { name: "Conflict check", status: "passed", detail: "No overlapping bulk updates." },
    ],
    externalTickets: [{ system: "ServiceNow", id: "CHG0012340", url: "#" }],
    timeline: [
      { ts: "2026-07-21 09:00 UTC", actor: "Workflow Automation Agent", kind: "system", text: "Change proposed." },
      { ts: "2026-07-21 10:00 UTC", actor: "amelia.ward", kind: "action", text: "Approved." },
      { ts: "2026-07-22 03:00 UTC", actor: "system", kind: "action", text: "Execution started." },
      { ts: "2026-07-22 03:12 UTC", actor: "system", kind: "status", text: "Stage → Executed (27/27 closed)." },
    ],
    audit: [
      { ts: "2026-07-21 09:00:00 UTC", actor: "svc-workflow-agent", action: "CREATE change_record", hash: "10ff…aab2" },
      { ts: "2026-07-21 10:00:12 UTC", actor: "amelia.ward", action: "APPROVE approval_step[1]", hash: "d4a3…9188" },
      { ts: "2026-07-22 03:12:07 UTC", actor: "system", action: "EXECUTE change_record", hash: "77bc…0421" },
    ],
    createdAt: "2026-07-21 09:00 UTC",
  },
];

export function stageIndex(stage: ChangeStage) {
  return CHANGE_STAGES.indexOf(stage);
}

export function approvalProgress(c: ChangeRecord) {
  const total = c.approvals.length;
  const done = c.approvals.filter((a) => a.status === "approved").length;
  return { done, total };
}

// ---------- Notifications ----------
export type NotificationKind = "approval_deadline" | "security_alert" | "incident" | "info";

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  ts: string;
  unread: boolean;
  href?: string;
}

export const notifications: Notification[] = [
  {
    id: "N-401",
    kind: "approval_deadline",
    title: "Approval due in 4h",
    body: "CHG0012345 — Reclaim 142 M365 E5 licenses. Awaiting Information Security sign-off.",
    ts: "8m ago",
    unread: true,
    href: "/approvals/CHG0012345",
  },
  {
    id: "N-402",
    kind: "security_alert",
    title: "Critical: IAM key age > 180d",
    body: "4 keys attached to elevated policies. See SEC-2201.",
    ts: "12m ago",
    unread: true,
  },
  {
    id: "N-403",
    kind: "incident",
    title: "P1 incident opened — Genesys EU-West",
    body: "Voice latency spike. Investigating (S. Nakamura).",
    ts: "38m ago",
    unread: true,
  },
  {
    id: "N-404",
    kind: "approval_deadline",
    title: "Approval SLA breach in 24h",
    body: "CHG0012346 — Right-size 38 EC2 instances awaiting owner review.",
    ts: "2h ago",
    unread: false,
    href: "/approvals/CHG0012346",
  },
  {
    id: "N-405",
    kind: "info",
    title: "Change executed",
    body: "CHG0012340 auto-closed 27 stale ServiceNow incidents.",
    ts: "3d ago",
    unread: false,
    href: "/approvals/CHG0012340",
  },
];
