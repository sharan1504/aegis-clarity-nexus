/**
 * Temporary deterministic fixtures for evaluating Aegis end-to-end before live
 * provider connections are configured. Demo mode exercises product contracts;
 * it must never claim that an external provider was actually contacted.
 */
export const DEMO_DATA_ENABLED = true;
export const DEMO_NOW = "2026-09-04T08:30:00.000Z";

export const DEMO_GENESYS = {
  provider: "Genesys Cloud" as const, orgName: "Acme Customer Care", region: "usw2.pure.cloud",
  lastSyncAt: "2026-09-04T07:45:00.000Z", healthStatus: "healthy", users: 184, activeUsers: 161,
  licensedUsers: 142, licenseAssignments: 158, licenseTypes: 6, queues: 27, emptyQueues: 3,
  multipleLicenseUsers: 11, inactiveLicensedUsers: 17,
  recommendations: [
    { key: "demo-genesys-inactive", title: "Review 17 licensed users with 90+ days of inactivity", severity: "high" as const, category: "License" as const, impact: "17 licensed accounts need review", evidence: "Demo user activity shows 17 assigned licenses without observed login for at least 90 days.", action: "Validate employment, leave status and business need before reclaiming any license.", canExecute: false },
    { key: "demo-genesys-multiple", title: "Review 11 users with multiple Genesys licenses", severity: "medium" as const, category: "License" as const, impact: "11 users have overlapping entitlements", evidence: "Demo license assignment data reports multiple licenses for these users.", action: "Review whether each entitlement is required.", canExecute: false },
    { key: "demo-genesys-empty", title: "Review 3 Genesys queues with no members", severity: "low" as const, category: "Operations" as const, impact: "3 queues have zero members", evidence: "Demo routing data reports zero members for three queues.", action: "Confirm whether each queue is intentionally inactive.", canExecute: false }
  ],
};

export const DEMO_AWS = {
  provider: "AWS", displayName: "AWS Production", region: "us-east-1", accountId: "123456789012", healthStatus: "healthy",
  lastSyncAt: "2026-09-04T07:30:00.000Z", resources: 426, computeResources: 118, storageResources: 164,
  databases: 23, loadBalancers: 14, monthlySpend: 28460, spendCurrency: "USD", spendChangePercent: 8.4,
  idleResources: 19, securityFindings: 7, criticalFindings: 1, highFindings: 3,
};

export const DEMO_INTEGRATIONS = [
  { id: "demo-genesys", provider: "genesys", status: "connected", healthStatus: "healthy", lastSyncAt: DEMO_GENESYS.lastSyncAt, lastSyncStatus: "success", isMock: true },
  { id: "demo-aws", provider: "aws", status: "connected", healthStatus: "healthy", lastSyncAt: DEMO_AWS.lastSyncAt, lastSyncStatus: "success", isMock: true },
  { id: "demo-m365", provider: "microsoft365", status: "connected", healthStatus: "healthy", lastSyncAt: "2026-09-04T07:20:00.000Z", lastSyncStatus: "success", isMock: true },
  { id: "demo-servicenow", provider: "servicenow", status: "connected", healthStatus: "healthy", lastSyncAt: "2026-09-04T07:10:00.000Z", lastSyncStatus: "success", isMock: true },
  { id: "demo-salesforce", provider: "salesforce", status: "connected", healthStatus: "healthy", lastSyncAt: "2026-09-04T07:00:00.000Z", lastSyncStatus: "success", isMock: true },
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
  { id: "demo-audit-6", action: "user.updated", entityType: "user", entityId: "demo-user-1", detail: "User role changed in Genesys Cloud.", actor: "admin@acme.example", createdAt: "2026-09-03T17:20:00.000Z" },
  { id: "demo-audit-7", action: "guardrail.blocked", entityType: "guardrail", entityId: "demo-guardrail-1", detail: "A proposed cloud mutation was blocked pending approval.", actor: "Aegis Governance", createdAt: "2026-09-03T12:10:00.000Z" },
  { id: "demo-audit-8", action: "change.approval.requested", entityType: "change", entityId: "demo-change-1", detail: "Approval requested for inactive license remediation.", actor: "Aegis License Optimization Agent", createdAt: "2026-09-03T09:30:00.000Z" },
];
export const DEMO_ANALYTICS_EVENTS = DEMO_AUDIT_EVENTS;
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

export const DEMO_USERS = [
  { id: "demo-user-1", name: "Alex Morgan", email: "alex.morgan@acme.example", role: "admin", status: "active", lastSeen: "2026-09-04T08:15:00.000Z" },
  { id: "demo-user-2", name: "Priya Shah", email: "priya.shah@acme.example", role: "manager", status: "active", lastSeen: "2026-09-04T07:58:00.000Z" },
  { id: "demo-user-3", name: "Daniel Kim", email: "daniel.kim@acme.example", role: "analyst", status: "active", lastSeen: "2026-09-04T07:45:00.000Z" },
  { id: "demo-user-4", name: "Jordan Lee", email: "jordan.lee@acme.example", role: "viewer", status: "invited", lastSeen: null },
];

export const DEMO_VULNERABILITIES = [
  { id: "demo-vuln-1", title: "Public security group exposes administrative port", severity: "critical", provider: "AWS", status: "open", asset: "sg-prod-admin", evidence: "Inbound 0.0.0.0/0 rule detected on TCP/22.", recommendation: "Restrict source ranges and verify administrative access path." },
  { id: "demo-vuln-2", title: "Inactive privileged account", severity: "high", provider: "Microsoft 365", status: "open", asset: "svc-reporting", evidence: "Privileged service account has not been used for 97 days.", recommendation: "Validate ownership and disable if no longer required." },
  { id: "demo-vuln-3", title: "Missing MFA enrollment", severity: "medium", provider: "Genesys Cloud", status: "review", asset: "user-118", evidence: "User is active without a current MFA enrollment signal.", recommendation: "Require MFA before next privileged operation." },
];

export const DEMO_INVESTIGATIONS = [
  { id: "demo-investigation-1", channel: "chat", customer: "Customer #48219", subject: "Order delivery delay", intent: "delivery_issue", status: "resolved", confidence: 0.96, createdAt: "2026-09-04T08:12:00.000Z", response: "I checked your order, shipment and inventory records. The carrier delay was confirmed and a replacement shipment was arranged." },
  { id: "demo-investigation-2", channel: "whatsapp", customer: "Customer #39102", subject: "Billing dispute", intent: "billing_dispute", status: "needs_human", confidence: 0.81, createdAt: "2026-09-04T07:48:00.000Z", response: "I found the disputed invoice and supporting transaction evidence. A billing specialist needs to review the final adjustment." },
];

export const DEMO_CHAT_SESSIONS = [
  { id: "demo-chat-1", title: "Delivery investigation", updatedAt: "2026-09-04T08:12:00.000Z", messages: [
    { role: "user" as const, content: "Where is my order?" },
    { role: "assistant" as const, content: "I investigated the order, shipment status, carrier update and inventory. The shipment is delayed in transit; a replacement workflow is ready if you approve it." },
  ] },
  { id: "demo-chat-2", title: "License optimization review", updatedAt: "2026-09-04T06:42:00.000Z", messages: [
    { role: "user" as const, content: "Find licenses unused for more than 90 days." },
    { role: "assistant" as const, content: "I found 17 inactive licensed users. I can show the evidence and prepare an approval-gated remediation." },
  ] },
];

export const DEMO_COMMAND_CENTER = {
  health: { status: "healthy", label: "All critical systems operational" },
  metrics: { activeAgents: 4, openFindings: 7, pendingApprovals: 4, investigations: 12, connectedSystems: 5 },
  trends: { incidents24h: 3, savings30d: 12480, riskReduction: 18.4 },
  priorities: [
    { id: "priority-1", title: "Critical AWS exposure", severity: "critical", owner: "Security Agent", status: "approval_required" },
    { id: "priority-2", title: "17 inactive Genesys licenses", severity: "high", owner: "License Optimization Agent", status: "review" },
    { id: "priority-3", title: "Delivery investigation awaiting verification", severity: "medium", owner: "Incident Agent", status: "verification" },
  ],
};

export const DEMO_AGENT_WORKFLOWS: Record<string, { trigger: string; description: string; config: Record<string, unknown>; steps: Array<{ id: string; name: string; type: string; provider?: string; capability?: string; action: string; requiresApproval?: boolean; verification?: string }> }> = {
  "agent-license": {
    trigger: "Scheduled daily + manual run",
    description: "Find and safely remediate unused or over-provisioned licenses across connected identity/contact-center systems.",
    config: { inactivityThresholdDays: 90, minimumSavingsUsd: 100, approvalMode: "required", notifyChannel: "email" },
    steps: [
      { id: "license-1", name: "Load user inventory", type: "evidence", provider: "Genesys", capability: "user_inventory", action: "Fetch active/inactive users and activity dates." },
      { id: "license-2", name: "Load license assignments", type: "evidence", provider: "Genesys", capability: "license_inventory", action: "Fetch current entitlements and assignment history." },
      { id: "license-3", name: "Apply inactivity policy", type: "decision", action: "Flag users inactive for the configured number of days." },
      { id: "license-4", name: "Create remediation proposal", type: "action", action: "Prepare license reclamation change; do not execute without approval.", requiresApproval: true },
      { id: "license-5", name: "Verify entitlement state", type: "verification", action: "Re-read assignment state and record the result.", verification: "Assignment count decreased only for approved users." },
      { id: "license-6", name: "Notify stakeholders", type: "response", action: "Send evidence-backed summary and customer/admin response." },
    ],
  },
  "agent-security": {
    trigger: "New security finding + hourly scan",
    description: "Correlate security findings, identity context and ownership, then route remediation through governance.",
    config: { severityThreshold: "medium", autoCreateChange: true, approvalMode: "required", verification: "required" },
    steps: [
      { id: "security-1", name: "Collect security findings", type: "evidence", provider: "AWS", capability: "security_findings", action: "Fetch current findings and affected assets." },
      { id: "security-2", name: "Correlate identity and owner", type: "evidence", provider: "Microsoft 365", capability: "user_inventory", action: "Identify owner, privilege and business context." },
      { id: "security-3", name: "Risk classification", type: "decision", action: "Score severity, blast radius and remediation urgency." },
      { id: "security-4", name: "Open governed remediation", type: "action", action: "Create change record and request approval.", requiresApproval: true },
      { id: "security-5", name: "Verify posture", type: "verification", action: "Re-scan affected asset after approved remediation.", verification: "Finding is closed or materially reduced." },
      { id: "security-6", name: "Publish resolution", type: "response", action: "Return evidence, action and verification outcome." },
    ],
  },
  "agent-incident": {
    trigger: "Incident created or critical alert detected",
    description: "Investigate an incident from signal to verified resolution across monitoring, service and customer systems.",
    config: { severityThreshold: "high", maxInvestigationMinutes: 15, approvalMode: "required", customerUpdate: "on_milestone" },
    steps: [
      { id: "incident-1", name: "Capture incident context", type: "intent", action: "Normalize alert, customer impact and affected service." },
      { id: "incident-2", name: "Correlate platform evidence", type: "evidence", provider: "ServiceNow", capability: "user_inventory", action: "Load related incidents, owners and recent changes." },
      { id: "incident-3", name: "Check infrastructure signals", type: "evidence", provider: "AWS", capability: "cloud_resource_inventory", action: "Inspect impacted resources and recent health signals." },
      { id: "incident-4", name: "Determine remediation", type: "decision", action: "Select the safest governed recovery path." },
      { id: "incident-5", name: "Execute approved action", type: "action", action: "Run the selected remediation through the execution gateway.", requiresApproval: true },
      { id: "incident-6", name: "Verify recovery", type: "verification", action: "Re-check service health and customer impact.", verification: "Incident signal clears and service returns to expected state." },
      { id: "incident-7", name: "Respond to customer", type: "response", action: "Provide concise outcome with evidence-backed explanation." },
    ],
  },
  "agent-cost": {
    trigger: "Daily cost analysis",
    description: "Identify idle and oversized cloud resources and propose approval-gated optimization.",
    config: { minimumSavingsUsd: 250, idleDays: 14, approvalMode: "required" },
    steps: [
      { id: "cost-1", name: "Load cost data", type: "evidence", provider: "AWS", capability: "cost_inventory", action: "Fetch spend and usage evidence." },
      { id: "cost-2", name: "Find idle resources", type: "evidence", provider: "AWS", capability: "cloud_resource_inventory", action: "Correlate resource utilization and idle period." },
      { id: "cost-3", name: "Calculate savings", type: "decision", action: "Apply tenant savings threshold and risk policy." },
      { id: "cost-4", name: "Request approval", type: "action", action: "Create governed optimization proposal.", requiresApproval: true },
      { id: "cost-5", name: "Verify spend impact", type: "verification", action: "Re-read resource state and expected spend impact." },
    ],
  },
  "agent-ccx": {
    trigger: "Daily routing health check",
    description: "Detect queue and routing inefficiencies in contact-center operations.",
    config: { emptyQueueThreshold: 1, approvalMode: "required" },
    steps: [
      { id: "ccx-1", name: "Inspect queues", type: "evidence", provider: "Genesys", capability: "queue_inventory", action: "Load queue membership and activity." },
      { id: "ccx-2", name: "Inspect presence", type: "evidence", provider: "Genesys", capability: "presence_inventory", action: "Correlate agent availability." },
      { id: "ccx-3", name: "Recommend routing change", type: "decision", action: "Prepare recommendation with affected queues and evidence." },
      { id: "ccx-4", name: "Verify routing", type: "verification", action: "Validate approved configuration after change." },
    ],
  },
  "agent-workflow": {
    trigger: "Workflow request or scheduled orchestration window",
    description: "Coordinate multi-step operational workflows across connected systems with governed execution.",
    config: { maxSteps: 12, approvalMode: "required", retryPolicy: "bounded" },
    steps: [
      { id: "workflow-1", name: "Resolve workflow intent", type: "intent", action: "Normalize the requested workflow and required capabilities." },
      { id: "workflow-2", name: "Load system evidence", type: "evidence", provider: "ServiceNow", capability: "user_inventory", action: "Load current state for each step target." },
      { id: "workflow-3", name: "Plan governed steps", type: "decision", action: "Order steps, dependencies and approval checkpoints." },
      { id: "workflow-4", name: "Execute approved steps", type: "action", action: "Run each approved step through the execution gateway.", requiresApproval: true },
      { id: "workflow-5", name: "Verify workflow outcome", type: "verification", action: "Re-read affected state per step.", verification: "Every executed step reports the expected end state." },
    ],
  },
  "agent-knowledge": {
    trigger: "Operator question in chat",
    description: "Answer operational questions using only authorized, connected system evidence.",
    config: { citationsRequired: true, approvalMode: "not_required", maxSources: 6 },
    steps: [
      { id: "knowledge-1", name: "Interpret question", type: "intent", action: "Identify the entities and time range being asked about." },
      { id: "knowledge-2", name: "Retrieve authorized evidence", type: "evidence", provider: "Genesys", capability: "user_inventory", action: "Read only capabilities bound to this agent." },
      { id: "knowledge-3", name: "Compose grounded answer", type: "decision", action: "Answer with citations, or state that evidence is insufficient." },
      { id: "knowledge-4", name: "Return response", type: "response", action: "Return the answer with sources and freshness." },
    ],
  },
};

export const DEMO_AGENT_KEYS = Object.keys(DEMO_AGENT_WORKFLOWS);
export const DEMO_PROFILES = DEMO_USERS.length;
export const DEMO_ROLES = 6;
