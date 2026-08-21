export type ProviderCapability = "read" | "write" | "sync" | "events";

export interface ProviderDefinition {
  id: string;
  name: string;
  category: string;
  description: string;
  auth: "OAuth 2.0" | "API Key" | "MCP";
  scopes: string[];
  capabilities: ProviderCapability[];
}

export const PROVIDER_REGISTRY: ProviderDefinition[] = [
  { id: "genesys", name: "Genesys Cloud", category: "Contact Center", description: "Voice, digital, workforce and license telemetry.", auth: "OAuth 2.0", scopes: ["organization:readonly", "users:readonly", "license:readonly", "routing:readonly", "analytics:readonly"], capabilities: ["read", "sync"] },
  { id: "aws", name: "AWS", category: "Cloud", description: "EC2, S3, IAM, Cost Explorer and CloudWatch.", auth: "OAuth 2.0", scopes: ["provider-managed"], capabilities: ["read", "sync"] },
  { id: "azure", name: "Microsoft Azure", category: "Cloud", description: "Resource Graph, Cost Management and Defender.", auth: "OAuth 2.0", scopes: ["provider-managed"], capabilities: ["read", "sync"] },
  { id: "m365", name: "Microsoft 365", category: "Productivity", description: "Entra ID, licensing, Teams and Exchange.", auth: "OAuth 2.0", scopes: ["LicenseAssignment.Read.All"], capabilities: ["read", "sync"] },
  { id: "jira", name: "Jira", category: "ITSM", description: "Issues, projects, workflows and automation.", auth: "OAuth 2.0", scopes: ["read:jira-work"], capabilities: ["read", "sync"] },
  { id: "servicenow", name: "ServiceNow", category: "ITSM", description: "Incidents, changes and CMDB.", auth: "OAuth 2.0", scopes: ["provider-managed"], capabilities: ["read", "sync"] },
  { id: "salesforce", name: "Salesforce", category: "CRM", description: "Accounts, opportunities, cases and events.", auth: "OAuth 2.0", scopes: ["api"], capabilities: ["read", "sync"] },
  { id: "slack", name: "Slack", category: "Collaboration", description: "Channels, messages and workflow context.", auth: "OAuth 2.0", scopes: ["provider-managed"], capabilities: ["read", "sync"] },
  { id: "github", name: "GitHub", category: "DevOps", description: "Repositories, Actions and security context.", auth: "OAuth 2.0", scopes: ["repo"], capabilities: ["read", "sync"] },
];
