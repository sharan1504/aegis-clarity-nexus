/**
 * Temporary review fixtures for evaluating the Aegis reporting model before live
 * provider connections are configured. Keep this file isolated so it can be
 * deleted cleanly once real tenant evidence is available.
 */
export const DEMO_DATA_ENABLED = true;
export const DEMO_NOW = "2026-09-04T08:30:00.000Z";

export const DEMO_GENESYS = {
  provider: "Genesys Cloud" as const,
  orgName: "Acme Customer Care",
  region: "usw2.pure.cloud",
  lastSyncAt: "2026-09-04T07:45:00.000Z",
  healthStatus: "healthy",
  users: 184,
  activeUsers: 161,
  licensedUsers: 142,
  licenseAssignments: 158,
  licenseTypes: 6,
  queues: 27,
  emptyQueues: 3,
  multipleLicenseUsers: 11,
  inactiveLicensedUsers: 17,
  recommendations: [
    { key: "demo-genesys-inactive-licensed-users", title: "Review 17 licensed users with 90+ days of inactivity", severity: "high" as const, category: "License" as const, impact: "17 licensed accounts need review", evidence: "Demo Genesys user activity and license assignments contain 17 assigned licenses with no observed login for at least 90 days.", action: "Validate employment, leave status and business need before reclaiming any license.", canExecute: false },
    { key: "demo-genesys-multiple-licenses", title: "Review 11 users with multiple Genesys licenses", severity: "medium" as const, category: "License" as const, impact: "11 users have overlapping entitlements", evidence: "Demo Genesys license assignment data reports more than one license for these users.", action: "Review whether each entitlement is required; do not remove access automatically.", canExecute: false },
    { key: "demo-genesys-empty-queues", title: "Review 3 Genesys queues with no members", severity: "low" as const, category: "Operations" as const, impact: "3 queues currently have zero members", evidence: "Demo Genesys routing queue data reports zero members for three queues.", action: "Confirm whether each queue is intentionally inactive before changing routing configuration.", canExecute: false }
  ],
};

export const DEMO_AWS = {
  provider: "AWS",
  displayName: "AWS Production",
  region: "us-east-1",
  accountId: "123456789012",
  healthStatus: "healthy",
  lastSyncAt: "2026-09-04T07:30:00.000Z",
  resources: 426,
  computeResources: 118,
  storageResources: 164,
  databases: 23,
  loadBalancers: 14,
  monthlySpend: 28460,
  spendCurrency: "USD",
  spendChangePercent: 8.4,
  idleResources: 19,
  securityFindings: 7,
  criticalFindings: 1,
  highFindings: 3,
};

export const DEMO_INTEGRATIONS = [
  { id: "demo-genesys", provider: "genesys", status: "connected", healthStatus: "healthy", lastSyncAt: DEMO_GENESYS.lastSyncAt, lastSyncStatus: "success", isMock: true },
  { id: "demo-aws", provider: "aws", status: "connected", healthStatus: "healthy", lastSyncAt: DEMO_AWS.lastSyncAt, lastSyncStatus: "success", isMock: true },
];

export const DEMO_CHANGES = [
  { id: "demo-change-1", changeId: "AIG-DEMO-1042", title: "Reclaim inactive Genesys Cloud licenses", stage: "Team Approvals", severity: "high", ownerTeam: "Contact Center / Licensing Operations", createdAt: "2026-09-04T06:50:00.000Z", updatedAt: "2026-09-04T07:10:00.000Z" },
  { id: "demo-change-2", changeId: "AIG-DEMO-1041", title: "Right-size idle AWS compute resources", stage: "Risk Review", severity: "medium", ownerTeam: "Cloud Platform", createdAt: "2026-09-03T15:20:00.000Z", updatedAt: "2026-09-04T06:20:00.000Z" },
  { id: "demo-change-3", changeId: "AIG-DEMO-1039", title: "Review overlapping Genesys entitlements", stage: "Proposed", severity: "medium", ownerTeam: "Identity & Access", createdAt: "2026-09-03T11:05:00.000Z", updatedAt: "2026-09-03T14:15:00.000Z" },
  { id: "demo-change-4", changeId: "AIG-DEMO-1036", title: "Resolve public AWS security group exposure", stage: "Scheduled", severity: "critical", ownerTeam: "Cloud Security", createdAt: "2026-09-02T09:40:00.000Z", updatedAt: "2026-09-03T16:30:00.000Z" },
];

export const DEMO_AUDIT_EVENTS = [
  { id: "demo-audit-1", action: "integration.sync.completed", entityType: "integration", entityId: "demo-genesys", detail: "Genesys Cloud demo evidence synchronized successfully.", actor: "system", createdAt: DEMO_GENESYS.lastSyncAt },
  { id: "demo-audit-2", action: "integration.sync.completed", entityType: "integration", entityId: "demo-aws", detail: "AWS demo inventory, cost and security evidence synchronized successfully.", actor: "system", createdAt: DEMO_AWS.lastSyncAt },
  { id: "demo-audit-3", action: "finding.detected", entityType: "vulnerability", entityId: "demo-aws-public-security-group", detail: "Critical AWS security exposure detected.", actor: "Aegis Security Agent", createdAt: "2026-09-04T06:55:00.000Z" },
  { id: "demo-audit-4", action: "finding.detected", entityType: "license", entityId: "demo-genesys-inactive", detail: "17 inactive licensed Genesys users identified.", actor: "Aegis License Optimization Agent", createdAt: "2026-09-04T06:40:00.000Z" },
  { id: "demo-audit-5", action: "agent.analysis.completed", entityType: "agent", entityId: "agent-cost", detail: "AWS idle-resource analysis completed.", actor: "Aegis Cloud Optimization Agent", createdAt: "2026-09-04T05:55:00.000Z" },
];

export const DEMO_ANALYTICS_EVENTS = [
  ...DEMO_AUDIT_EVENTS,
  { id: "demo-audit-6", action: "user.updated", entityType: "user", entityId: "demo-user-1", detail: "User role changed in Genesys Cloud.", actor: "admin@acme.example", createdAt: "2026-09-03T17:20:00.000Z" },
  { id: "demo-audit-7", action: "guardrail.blocked", entityType: "guardrail", entityId: "demo-guardrail-1", detail: "A proposed cloud mutation was blocked pending approval.", actor: "Aegis Governance", createdAt: "2026-09-03T12:10:00.000Z" },
  { id: "demo-audit-8", action: "change.approval.requested", entityType: "change", entityId: "demo-change-1", detail: "Approval requested for inactive license remediation.", actor: "Aegis License Optimization Agent", createdAt: "2026-09-03T09:30:00.000Z" },
];

export const DEMO_ANALYTICS_CHANGES = [
  { id: "demo-change-1", agent: "agent-license", stage: "Team Approvals", severity: "high", risk: { tier: "High" }, created_at: "2026-09-04T06:50:00.000Z", estimated_savings_amount: 6120, estimated_savings_currency: "USD", estimated_cost_amount: 0, estimated_cost_currency: "USD", estimated_downtime_minutes: 0 },
  { id: "demo-change-2", agent: "agent-cost", stage: "Risk Review", severity: "medium", risk: { tier: "Medium" }, created_at: "2026-09-03T15:20:00.000Z", estimated_savings_amount: 3480, estimated_savings_currency: "USD", estimated_cost_amount: 0, estimated_cost_currency: "USD", estimated_downtime_minutes: 0 },
  { id: "demo-change-3", agent: "agent-security", stage: "Scheduled", severity: "critical", risk: { tier: "Critical" }, created_at: "2026-09-03T09:40:00.000Z", estimated_savings_amount: 0, estimated_savings_currency: "USD", estimated_cost_amount: 250, estimated_cost_currency: "USD", estimated_downtime_minutes: 5 },
];

export const DEMO_AI_USAGE = [
  { agent_key: "agent-license", total_tokens: 18420, input_tokens: 12200, output_tokens: 6220, latency_ms: 840, created_at: "2026-09-04T06:42:00.000Z" },
  { agent_key: "agent-cost", total_tokens: 24110, input_tokens: 15900, output_tokens: 8210, latency_ms: 1120, created_at: "2026-09-04T05:56:00.000Z" },
  { agent_key: "agent-security", total_tokens: 31880, input_tokens: 21100, output_tokens: 10780, latency_ms: 1350, created_at: "2026-09-03T09:41:00.000Z" },
];

export const DEMO_PROFILES = 184;
export const DEMO_ROLES = 6;
