import type { AegisConnector } from "@/lib/core";

export type ConnectorKey =
  | "genesys"
  | "aws"
  | "azure"
  | "microsoft365"
  | "jira"
  | "servicenow"
  | "salesforce"
  | "slack"
  | "github";

export type AuthMode = "oauth2" | "client_credentials" | "aws_role" | "api_token";

export interface ConnectorDefinition {
  key: ConnectorKey;
  displayName: string;
  authMode: AuthMode;
  authorizationUrl?: string;
  tokenUrl?: string;
  scopes: string[];
  readCapabilities: string[];
  writeCapabilities: string[];
  requiresCustomerAppRegistration: boolean;
  secretFields: string[];
}

/**
 * Production connector manifest. Endpoint and scope values are deliberately
 * explicit so the UI cannot present a provider as configured when its server
 * connector is absent. Provider implementations must live server-side.
 *
 * OAuth client IDs/secrets are NEVER stored in this file; these are names of
 * environment/secret-store fields only.
 */
export const CONNECTOR_DEFINITIONS: Record<ConnectorKey, ConnectorDefinition> = {
  genesys: {
    key: "genesys",
    displayName: "Genesys Cloud",
    authMode: "oauth2",
    authorizationUrl: "https://login.mypurecloud.com/oauth/authorize",
    tokenUrl: "https://login.mypurecloud.com/oauth/token",
    scopes: ["users", "authorization", "routing"],
    readCapabilities: ["users", "licenses", "license_assignments", "queues"],
    writeCapabilities: ["license_assignment"],
    requiresCustomerAppRegistration: true,
    secretFields: ["clientId", "clientSecret"],
  },
  aws: {
    key: "aws",
    displayName: "Amazon Web Services",
    authMode: "aws_role",
    scopes: [],
    readCapabilities: ["iam", "costs", "resources", "cloudwatch"],
    writeCapabilities: ["approved_resource_action"],
    requiresCustomerAppRegistration: false,
    secretFields: ["roleArn", "externalId"],
  },
  azure: {
    key: "azure",
    displayName: "Microsoft Azure",
    authMode: "client_credentials",
    authorizationUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
    scopes: ["https://management.azure.com/.default"],
    readCapabilities: ["subscriptions", "resources", "costs", "security"],
    writeCapabilities: ["approved_resource_action"],
    requiresCustomerAppRegistration: true,
    secretFields: ["tenantId", "clientId", "clientSecret"],
  },
  microsoft365: {
    key: "microsoft365",
    displayName: "Microsoft 365 / Entra ID",
    authMode: "client_credentials",
    authorizationUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
    scopes: ["https://graph.microsoft.com/.default"],
    readCapabilities: ["users", "licenses", "license_assignments"],
    writeCapabilities: ["license_assignment"],
    requiresCustomerAppRegistration: true,
    secretFields: ["tenantId", "clientId", "clientSecret"],
  },
  jira: {
    key: "jira",
    displayName: "Jira Cloud",
    authMode: "oauth2",
    authorizationUrl: "https://auth.atlassian.com/authorize",
    tokenUrl: "https://auth.atlassian.com/oauth/token",
    scopes: ["read:jira-work", "read:jira-user", "offline_access"],
    readCapabilities: ["projects", "issues", "users", "worklogs"],
    writeCapabilities: ["issue", "comment"],
    requiresCustomerAppRegistration: true,
    secretFields: ["clientId", "clientSecret"],
  },
  servicenow: {
    key: "servicenow",
    displayName: "ServiceNow",
    authMode: "oauth2",
    authorizationUrl: "https://{instance}.service-now.com/oauth_auth.do",
    tokenUrl: "https://{instance}.service-now.com/oauth_token.do",
    scopes: ["useraccount"],
    readCapabilities: ["users", "incidents", "changes", "requests", "cmdb"],
    writeCapabilities: ["incident", "change", "request"],
    requiresCustomerAppRegistration: true,
    secretFields: ["instance", "clientId", "clientSecret"],
  },
  salesforce: {
    key: "salesforce",
    displayName: "Salesforce",
    authMode: "oauth2",
    authorizationUrl: "https://login.salesforce.com/services/oauth2/authorize",
    tokenUrl: "https://login.salesforce.com/services/oauth2/token",
    scopes: ["api", "refresh_token", "offline_access"],
    readCapabilities: ["users", "licenses", "accounts", "cases", "opportunities"],
    writeCapabilities: ["case", "task", "record"],
    requiresCustomerAppRegistration: true,
    secretFields: ["clientId", "clientSecret"],
  },
  slack: {
    key: "slack",
    displayName: "Slack",
    authMode: "oauth2",
    authorizationUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: ["users:read", "team:read", "channels:read", "groups:read", "channels:history", "groups:history"],
    readCapabilities: ["workspace", "users", "channels", "messages"],
    writeCapabilities: ["message"],
    requiresCustomerAppRegistration: true,
    secretFields: ["clientId", "clientSecret", "signingSecret"],
  },
  github: {
    key: "github",
    displayName: "GitHub",
    authMode: "oauth2",
    authorizationUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["read:org", "repo", "read:user", "workflow"],
    readCapabilities: ["organizations", "repositories", "issues", "pull_requests", "actions"],
    writeCapabilities: ["issue", "pull_request", "workflow"],
    requiresCustomerAppRegistration: true,
    secretFields: ["clientId", "clientSecret"],
  },
};

export function getConnectorDefinition(key: string): ConnectorDefinition | null {
  return CONNECTOR_DEFINITIONS[key as ConnectorKey] ?? null;
}

export function assertConnectorDefinition(key: string): ConnectorDefinition {
  const definition = getConnectorDefinition(key);
  if (!definition) throw new Error(`Unsupported connector: ${key}`);
  return definition;
}

export interface ConnectorFactory {
  create(connection: unknown): AegisConnector;
}

/** Runtime registry populated only by connectors that have real server implementations. */
export const CONNECTOR_FACTORIES = new Map<ConnectorKey, ConnectorFactory>();

export function registerConnector(key: ConnectorKey, factory: ConnectorFactory): void {
  CONNECTOR_FACTORIES.set(key, factory);
}
