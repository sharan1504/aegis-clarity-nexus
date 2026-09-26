import type { CapabilityKey } from "@/lib/capabilities/registry";

export type AgentPlaybookStep = {
  id: string;
  name: string;
  capabilities: CapabilityKey[];
  purpose: string;
  maxTools?: number;
};

export type AgentPlaybook = {
  agentKey: string;
  mission: string;
  outOfScope: string[];
  requiredCapabilities: CapabilityKey[];
  optionalCapabilities: CapabilityKey[];
  preferredProviders: string[];
  investigationPlaybook: AgentPlaybookStep[];
  outputContract: {
    findingTypes: string[];
    requiresEvidence: boolean;
    confidenceRequired: boolean;
    dataGapsRequired: boolean;
  };
  remediation: "read_only" | "approval_gated";
  learning: "outcome_feedback_only";
};

const playbook = (
  agentKey: string,
  mission: string,
  outOfScope: string[],
  requiredCapabilities: CapabilityKey[],
  optionalCapabilities: CapabilityKey[],
  preferredProviders: string[],
  investigationPlaybook: AgentPlaybookStep[],
  findingTypes: string[],
  remediation: "read_only" | "approval_gated" = "read_only",
): AgentPlaybook => ({
  agentKey,
  mission,
  outOfScope,
  requiredCapabilities,
  optionalCapabilities,
  preferredProviders,
  investigationPlaybook,
  outputContract: { findingTypes, requiresEvidence: true, confidenceRequired: true, dataGapsRequired: true },
  remediation,
  learning: "outcome_feedback_only",
});

export const AGENT_PLAYBOOKS: Record<string, AgentPlaybook> = {
  "agent-license": playbook(
    "agent-license",
    "Find entitlement waste, lifecycle risk and assignment anomalies using authorized license, identity, queue and presence evidence.",
    ["Inventing utilization, pricing or savings when the source does not provide it.", "Changing assignments without the governed approval path."],
    ["license_inventory", "user_inventory"],
    ["queue_inventory", "presence_inventory"],
    ["genesys", "microsoft365", "m365", "google-workspace", "salesforce"],
    [
      { id: "scope", name: "Scope entitlements and identities", capabilities: ["license_inventory", "user_inventory"], purpose: "Establish the complete authorized population before optimization." },
      { id: "activity", name: "Check utilization and activity context", capabilities: ["queue_inventory", "presence_inventory"], purpose: "Separate genuine inactivity from active operational responsibility." },
      { id: "exceptions", name: "Surface lifecycle and assignment exceptions", capabilities: ["license_inventory", "user_inventory"], purpose: "Correlate duplicate, stale or anomalous assignments with identity evidence." },
    ],
    ["unused_entitlement", "duplicate_assignment", "lifecycle_exception", "data_gap"],
  ),
  "agent-cost": playbook(
    "agent-cost",
    "Investigate cloud spend, resource utilization and efficiency opportunities from connected cost and resource evidence.",
    ["Estimating savings without cost or utilization evidence.", "Mutating cloud resources outside approval."],
    ["cost_inventory"],
    ["cloud_resource_inventory"],
    ["aws", "azure", "gcp"],
    [
      { id: "spend", name: "Scope spend signals", capabilities: ["cost_inventory"], purpose: "Establish provider, period and spend evidence." },
      { id: "resources", name: "Correlate resources", capabilities: ["cloud_resource_inventory"], purpose: "Link cost signals to resource inventory where synchronized." },
      { id: "efficiency", name: "Identify efficiency patterns", capabilities: ["cost_inventory", "cloud_resource_inventory"], purpose: "Find evidence-backed idle, right-sizing or anomaly candidates." },
    ],
    ["spend_anomaly", "idle_resource", "rightsizing_candidate", "data_gap"],
  ),
  "agent-security": playbook(
    "agent-security",
    "Investigate security exposure by correlating findings, identity context, incidents and affected assets across connected providers.",
    ["Claiming a provider finding when that provider has no synchronized evidence.", "Executing remediation directly from model output."],
    ["security_findings", "user_inventory"],
    ["incident_signals", "integration_inventory", "operations_overview"],
    ["github", "gitlab", "crowdstrike", "microsoft-defender", "okta", "splunk", "rubrik", "aws", "azure"],
    [
      { id: "findings", name: "Collect security findings", capabilities: ["security_findings"], purpose: "Enumerate synchronized vulnerabilities, alerts and posture findings." },
      { id: "identity", name: "Correlate identities", capabilities: ["user_inventory"], purpose: "Link affected identities when provider evidence supports it." },
      { id: "impact", name: "Assess incident and operational context", capabilities: ["incident_signals", "operations_overview"], purpose: "Determine whether findings overlap with active incidents or operational impact." },
    ],
    ["vulnerability", "exposure", "identity_risk", "correlated_incident", "data_gap"],
  ),
  "agent-incident": playbook(
    "agent-incident",
    "Investigate incidents by building an evidence-backed timeline across alerts, security signals, changes and operational state.",
    ["Declaring root cause when evidence only supports a hypothesis.", "Inventing impact, timeline events or provider health."],
    ["incident_signals"],
    ["security_findings", "change_records", "operations_overview"],
    ["pagerduty", "datadog", "newrelic", "splunk", "servicenow", "jira"],
    [
      { id: "signals", name: "Collect incident signals", capabilities: ["incident_signals"], purpose: "Establish active and recent incidents and alerts." },
      { id: "correlate", name: "Correlate security and change context", capabilities: ["security_findings", "change_records"], purpose: "Identify evidence that supports or contradicts causal hypotheses." },
      { id: "impact", name: "Assess operational impact", capabilities: ["operations_overview"], purpose: "Ground blast radius and current operational state." },
    ],
    ["incident", "root_cause_hypothesis", "blast_radius", "data_gap"],
  ),
  "agent-ccx": playbook(
    "agent-ccx",
    "Analyze contact-center routing health, queue capacity, presence and distribution signals.",
    ["Inventing routing rules or queue performance when not synchronized.", "Changing routing configuration without approval."],
    ["queue_inventory"],
    ["presence_inventory", "routing_inventory", "user_inventory"],
    ["genesys"],
    [
      { id: "queues", name: "Scope queues", capabilities: ["queue_inventory"], purpose: "Establish queue population and membership context." },
      { id: "availability", name: "Correlate agent availability", capabilities: ["presence_inventory", "user_inventory"], purpose: "Relate queue state to current presence and identity evidence." },
      { id: "routing", name: "Inspect routing configuration", capabilities: ["routing_inventory"], purpose: "Use routing evidence when the provider actually synchronizes it." },
    ],
    ["queue_anomaly", "capacity_risk", "routing_gap", "data_gap"],
  ),
  "agent-workflow": playbook(
    "agent-workflow",
    "Coordinate governed multi-step operational workflows using change, integration and identity context.",
    ["Executing provider mutations without approval.", "Treating a proposed change as an executed change."],
    ["change_records"],
    ["integration_inventory", "user_inventory", "operations_overview"],
    ["servicenow", "jira", "salesforce"],
    [
      { id: "changes", name: "Scope change state", capabilities: ["change_records"], purpose: "Establish pending, approved and completed change evidence." },
      { id: "dependencies", name: "Inspect dependencies", capabilities: ["integration_inventory", "operations_overview"], purpose: "Identify affected systems and operational context." },
      { id: "authorization", name: "Verify accountable identity context", capabilities: ["user_inventory"], purpose: "Use identity evidence when the workflow requires an owner or approver." },
    ],
    ["workflow_blocker", "approval_gap", "dependency_risk", "data_gap"],
    "approval_gated",
  ),
  "agent-knowledge": playbook(
    "agent-knowledge",
    "Find authoritative operational knowledge, freshness gaps and contradictions from connected knowledge sources.",
    ["Answering from documents that are not synchronized or authorized.", "Treating stale knowledge as current truth."],
    ["knowledge_inventory"],
    ["user_inventory", "license_inventory"],
    ["confluence", "slack", "zendesk", "freshworks"],
    [
      { id: "sources", name: "Inventory knowledge sources", capabilities: ["knowledge_inventory"], purpose: "Establish available source coverage and freshness." },
      { id: "context", name: "Add operational context", capabilities: ["user_inventory", "license_inventory"], purpose: "Correlate knowledge with authorized operational identity or entitlement context when available." },
      { id: "gaps", name: "Surface freshness and coverage gaps", capabilities: ["knowledge_inventory"], purpose: "Identify stale, missing or contradictory knowledge evidence." },
    ],
    ["knowledge_gap", "stale_source", "coverage_gap", "data_gap"],
  ),
  "agent-productivity": playbook(
    "agent-productivity",
    "Analyze workload, throughput and cycle-time signals from connected work-item providers without inventing activity.",
    ["Inferring employee performance from unsupported data.", "Using sample activity when a provider has no live productivity capability."],
    ["productivity_activity"],
    ["user_inventory"],
    ["jira", "servicenow", "salesforce", "zendesk", "freshworks", "genesys"],
    [
      { id: "activity", name: "Collect work-item activity", capabilities: ["productivity_activity"], purpose: "Establish synchronized workload and throughput evidence." },
      { id: "identity", name: "Correlate accountable identities", capabilities: ["user_inventory"], purpose: "Attribute work only when identity evidence supports it." },
    ],
    ["throughput_signal", "cycle_time_signal", "workload_anomaly", "data_gap"],
  ),
};

export function getAgentPlaybook(agentKey: string): AgentPlaybook {
  return AGENT_PLAYBOOKS[agentKey] ?? playbook(
    agentKey,
    "Investigate the configured operational domain using only authorized connected capabilities.",
    ["Unsupported provider claims", "Unapproved provider mutations"],
    [],
    [],
    [],
    [{ id: "discovery", name: "Discover authorized evidence", capabilities: [], purpose: "Report available tools and data gaps before analysis." }],
    ["data_gap"],
  );
}

export const AGENT_PLAYBOOK_KEYS = Object.keys(AGENT_PLAYBOOKS);
