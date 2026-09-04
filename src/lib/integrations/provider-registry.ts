export type ProviderCapability = "read" | "write" | "sync" | "events";
export type ProviderAvailability = "available" | "coming_soon";

export interface ProviderDefinition {
  id: string;
  name: string;
  category: string;
  description: string;
  auth: "OAuth 2.0" | "API Key" | "Access Keys" | "MCP";
  scopes: string[];
  capabilities: ProviderCapability[];
  availability: ProviderAvailability;
  logoUrl: string;
}

const logo = (slug: string) => `https://cdn.simpleicons.org/${slug}`;

export const PROVIDER_REGISTRY: ProviderDefinition[] = [
  { id: "genesys", name: "Genesys Cloud", category: "Contact Center", description: "Voice, digital, workforce and license telemetry.", auth: "OAuth 2.0", scopes: ["organization:readonly", "users:readonly", "license:readonly", "routing:readonly", "analytics:readonly"], capabilities: ["read", "sync"], availability: "available", logoUrl: logo("genesys") },
  { id: "aws", name: "AWS", category: "Cloud", description: "EC2, S3, IAM, Cost Explorer and CloudWatch.", auth: "Access Keys", scopes: ["provider-managed"], capabilities: ["read", "sync"], availability: "available", logoUrl: logo("amazonaws") },
  { id: "azure", name: "Microsoft Azure", category: "Cloud", description: "Resource Graph, Cost Management and Defender.", auth: "OAuth 2.0", scopes: ["provider-managed"], capabilities: ["read", "sync"], availability: "available", logoUrl: logo("microsoftazure") },
  { id: "gcp", name: "Google Cloud", category: "Cloud", description: "Compute, storage, IAM and cloud cost insights.", auth: "OAuth 2.0", scopes: ["provider-managed"], capabilities: ["read", "sync"], availability: "coming_soon", logoUrl: logo("googlecloud") },
  { id: "m365", name: "Microsoft 365", category: "Productivity", description: "Entra ID, licensing, Teams and Exchange.", auth: "OAuth 2.0", scopes: ["LicenseAssignment.Read.All", "User.Read.All"], capabilities: ["read", "sync"], availability: "available", logoUrl: logo("microsoftoffice") },
  { id: "google-workspace", name: "Google Workspace", category: "Productivity", description: "Users, groups, Drive and workspace administration.", auth: "OAuth 2.0", scopes: ["provider-managed"], capabilities: ["read", "sync"], availability: "coming_soon", logoUrl: logo("google") },
  { id: "jira", name: "Jira", category: "ITSM & DevOps", description: "Issues, projects, workflows and automation.", auth: "OAuth 2.0", scopes: ["read:jira-work", "write:jira-work"], capabilities: ["read", "write", "sync"], availability: "available", logoUrl: logo("jira") },
  { id: "servicenow", name: "ServiceNow", category: "ITSM", description: "Incidents, changes, problems and CMDB.", auth: "OAuth 2.0", scopes: ["provider-managed"], capabilities: ["read", "write", "sync"], availability: "available", logoUrl: logo("servicenow") },
  { id: "freshworks", name: "Freshworks", category: "ITSM & Customer Support", description: "Freshservice, Freshdesk, tickets, assets and SLAs.", auth: "API Key", scopes: ["provider-managed"], capabilities: ["read", "write", "sync"], availability: "coming_soon", logoUrl: logo("freshworks") },
  { id: "zendesk", name: "Zendesk", category: "Customer Support", description: "Support tickets, customers, agents and service metrics.", auth: "OAuth 2.0", scopes: ["provider-managed"], capabilities: ["read", "write", "sync"], availability: "coming_soon", logoUrl: logo("zendesk") },
  { id: "salesforce", name: "Salesforce", category: "CRM", description: "Accounts, opportunities, cases and events.", auth: "OAuth 2.0", scopes: ["api"], capabilities: ["read", "sync"], availability: "available", logoUrl: logo("salesforce") },
  { id: "zoho", name: "Zoho", category: "CRM & Business", description: "CRM, Desk, Projects and business applications.", auth: "OAuth 2.0", scopes: ["provider-managed"], capabilities: ["read", "write", "sync"], availability: "coming_soon", logoUrl: logo("zoho") },
  { id: "hubspot", name: "HubSpot", category: "CRM & Marketing", description: "CRM records, tickets, engagements and automation context.", auth: "OAuth 2.0", scopes: ["provider-managed"], capabilities: ["read", "sync"], availability: "coming_soon", logoUrl: logo("hubspot") },
  { id: "slack", name: "Slack", category: "Collaboration", description: "Channels, messages and workflow context.", auth: "OAuth 2.0", scopes: ["provider-managed"], capabilities: ["read", "sync"], availability: "available", logoUrl: logo("slack") },
  { id: "github", name: "GitHub", category: "DevOps", description: "Repositories, Actions and security context.", auth: "OAuth 2.0", scopes: ["repo"], capabilities: ["read", "sync"], availability: "available", logoUrl: logo("github") },
  { id: "gitlab", name: "GitLab", category: "DevOps", description: "Projects, pipelines, repositories and security findings.", auth: "OAuth 2.0", scopes: ["provider-managed"], capabilities: ["read", "sync"], availability: "coming_soon", logoUrl: logo("gitlab") },
  { id: "confluence", name: "Confluence", category: "Knowledge & Collaboration", description: "Knowledge spaces, pages and operational documentation.", auth: "OAuth 2.0", scopes: ["provider-managed"], capabilities: ["read", "sync"], availability: "coming_soon", logoUrl: logo("confluence") },
  { id: "rubrik", name: "Rubrik", category: "Data Protection", description: "Backup, recovery, protection policies and cyber resilience.", auth: "API Key", scopes: ["provider-managed"], capabilities: ["read", "sync"], availability: "coming_soon", logoUrl: logo("rubrik") },
  { id: "veeam", name: "Veeam", category: "Data Protection", description: "Backup jobs, repositories, recovery and protection posture.", auth: "API Key", scopes: ["provider-managed"], capabilities: ["read", "sync"], availability: "coming_soon", logoUrl: logo("veeam") },
  { id: "cohesity", name: "Cohesity", category: "Data Protection", description: "Data security, backup, recovery and storage management.", auth: "API Key", scopes: ["provider-managed"], capabilities: ["read", "sync"], availability: "coming_soon", logoUrl: logo("cohesity") },
  { id: "crowdstrike", name: "CrowdStrike", category: "Security", description: "Endpoint security, detections, vulnerabilities and identity context.", auth: "OAuth 2.0", scopes: ["provider-managed"], capabilities: ["read", "sync", "events"], availability: "coming_soon", logoUrl: logo("crowdstrike") },
  { id: "microsoft-defender", name: "Microsoft Defender", category: "Security", description: "Threat detections, vulnerabilities and security posture.", auth: "OAuth 2.0", scopes: ["provider-managed"], capabilities: ["read", "sync", "events"], availability: "coming_soon", logoUrl: logo("microsoftdefender") },
  { id: "okta", name: "Okta", category: "Identity & Security", description: "Users, groups, applications and identity events.", auth: "OAuth 2.0", scopes: ["provider-managed"], capabilities: ["read", "sync", "events"], availability: "coming_soon", logoUrl: logo("okta") },
  { id: "datadog", name: "Datadog", category: "Observability", description: "Metrics, monitors, logs and service health signals.", auth: "API Key", scopes: ["provider-managed"], capabilities: ["read", "sync", "events"], availability: "coming_soon", logoUrl: logo("datadog") },
  { id: "newrelic", name: "New Relic", category: "Observability", description: "Application performance, alerts and infrastructure telemetry.", auth: "API Key", scopes: ["provider-managed"], capabilities: ["read", "sync", "events"], availability: "coming_soon", logoUrl: logo("newrelic") },
  { id: "splunk", name: "Splunk", category: "Observability & Security", description: "Logs, security analytics and operational event data.", auth: "API Key", scopes: ["provider-managed"], capabilities: ["read", "sync", "events"], availability: "coming_soon", logoUrl: logo("splunk") },
  { id: "pagerduty", name: "PagerDuty", category: "Incident Management", description: "Incidents, services, on-call schedules and response metrics.", auth: "API Key", scopes: ["provider-managed"], capabilities: ["read", "sync", "events"], availability: "coming_soon", logoUrl: logo("pagerduty") },
  { id: "workday", name: "Workday", category: "HR & Workforce", description: "Workforce identity, organizational and lifecycle context.", auth: "OAuth 2.0", scopes: ["provider-managed"], capabilities: ["read", "sync"], availability: "coming_soon", logoUrl: logo("workday") },
  { id: "sap", name: "SAP", category: "ERP", description: "Enterprise business operations, users and system context.", auth: "OAuth 2.0", scopes: ["provider-managed"], capabilities: ["read", "sync"], availability: "coming_soon", logoUrl: logo("sap") },
  { id: "oracle", name: "Oracle", category: "ERP & Database", description: "Enterprise applications, databases and infrastructure context.", auth: "OAuth 2.0", scopes: ["provider-managed"], capabilities: ["read", "sync"], availability: "coming_soon", logoUrl: logo("oracle") },
  { id: "snowflake", name: "Snowflake", category: "Data & Analytics", description: "Warehouses, databases, usage and data platform telemetry.", auth: "OAuth 2.0", scopes: ["provider-managed"], capabilities: ["read", "sync"], availability: "coming_soon", logoUrl: logo("snowflake") },
  { id: "mongodb", name: "MongoDB", category: "Database", description: "Clusters, databases, performance and operational health.", auth: "API Key", scopes: ["provider-managed"], capabilities: ["read", "sync"], availability: "coming_soon", logoUrl: logo("mongodb") },
];
