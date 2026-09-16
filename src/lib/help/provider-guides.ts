import type { HelpSection, HelpTopic } from "./content";
import { PROVIDER_REGISTRY, type ProviderDefinition } from "@/lib/integrations/provider-registry";
import { CONTRACT_IMPLEMENTED_PROVIDERS } from "@/lib/integrations/provider-contract";

export const PROVIDER_HELP_GROUP = "Provider setup guides" as const;

const s = (heading: string, body: string, bullets?: string[], steps?: string[]): HelpSection => ({ heading, body, bullets, steps });
const fullContract = new Set(CONTRACT_IMPLEMENTED_PROVIDERS);

/** Verified server-side authentication implementations identified in the current repository. */
const authImplemented = new Set([
  "genesys", "aws", "azure", "gcp", "m365", "google-workspace", "jira", "servicenow", "freshworks", "zendesk",
  "salesforce", "zoho", "hubspot", "slack", "github", "gitlab", "confluence", "rubrik", "veeam", "cohesity",
  "crowdstrike", "microsoft-defender", "okta", "datadog", "newrelic", "splunk", "pagerduty", "workday", "sap",
  "oracle", "snowflake", "mongodb",
]);

const authModel: Record<string, string> = {
  genesys: "OAuth 2.0 through the dedicated Genesys Cloud integration flow.",
  github: "GitHub App installation; the product does not use a personal access token for the integration flow.",
  aws: "AWS IAM role assumption using a role ARN and a generated external ID.",
  azure: "Microsoft Entra client-credentials authentication for Azure management APIs; the current contract set does not include Azure.",
  gcp: "Google service account credentials with a project ID.",
  m365: "Microsoft Entra application / client-credentials authentication for Microsoft Graph.",
  "google-workspace": "Google service account with domain-wide delegated admin access.",
  jira: "OAuth 2.0 using a Jira OAuth client and redirect URI.",
  servicenow: "OAuth 2.0 using a ServiceNow instance URL, client ID/secret and redirect URI.",
  freshworks: "OAuth 2.0 using the Freshservice organization URL and OAuth client credentials.",
  zendesk: "OAuth 2.0 using a Zendesk subdomain and OAuth client credentials.",
  salesforce: "OAuth 2.0 using Salesforce client credentials and the configured redirect URI.",
  zoho: "OAuth 2.0 using the selected Zoho Accounts URL and OAuth client credentials.",
  hubspot: "OAuth 2.0 using HubSpot client credentials and redirect URI.",
  slack: "OAuth 2.0 using Slack client credentials and redirect URI.",
  gitlab: "OAuth 2.0 using the GitLab instance URL, client credentials and redirect URI.",
  confluence: "OAuth 2.0 using Confluence OAuth client credentials and redirect URI.",
  rubrik: "Client-credentials authentication using Rubrik Security Cloud client credentials and an access-token URI.",
  veeam: "Veeam Service Provider Console username/password authentication through the provider connector.",
  cohesity: "API key against a configured Cohesity API base URL.",
  crowdstrike: "OAuth 2.0 client credentials against the configured Falcon API base URL.",
  "microsoft-defender": "Microsoft Entra application client credentials with tenant context.",
  okta: "Okta SSWS API token against the configured organization URL.",
  datadog: "Datadog API key plus application key and site selection.",
  newrelic: "New Relic user API key with a selected US/EU/Japan region.",
  splunk: "Bearer token against a configured Splunk REST API base URL.",
  pagerduty: "PagerDuty REST API token.",
  workday: "OAuth 2.0 with region, tenant alias and OAuth client credentials.",
  sap: "OAuth 2.0 using product/tenant-specific authorization and token endpoints supplied by the SAP service binding.",
  oracle: "OAuth 2.0 / Oracle application credentials using the configured identity-domain URL and scope.",
  snowflake: "OAuth 2.0 using the account-specific URL and OAuth client credentials.",
  mongodb: "MongoDB Atlas service-account client credentials.",
};

const prerequisites: Record<string, string> = {
  genesys: "A Genesys Cloud OAuth client, client secret, supported region and product redirect URI.",
  github: "Permission to install the Aegis GitHub App and select the repositories the installation may access.",
  aws: "An AWS administrator must create/allow the target IAM role and trust the Aegis AWS account using the generated external ID. The Integrations form supplies the role ARN and external ID inputs.",
  azure: "An Entra application with client secret, tenant ID and permission to read Azure subscriptions through the management API.",
  gcp: "A Google Cloud service account, private key, target project ID and permission to read that project.",
  m365: "An Entra application with tenant ID, client ID/secret and the Microsoft Graph application permissions required by the implemented M365 connector.",
  "google-workspace": "A Google service account plus delegated admin configuration for the required Workspace Admin SDK read scopes.",
  servicenow: "A ServiceNow instance URL, OAuth application, client ID/secret and matching redirect URI.",
  freshworks: "A Freshservice organization URL, OAuth application, client ID/secret and redirect URI.",
  zendesk: "A Zendesk subdomain, global OAuth client and client secret with the product redirect URI configured.",
  workday: "A Workday region, tenant alias, OAuth client ID/secret and redirect URI.",
  sap: "An SAP product or BTP service binding that supplies the exact OAuth authorization/token URLs and optional API base URL. The product does not guess these endpoints.",
};

const defaultPrerequisites = (provider: ProviderDefinition) => prerequisites[provider.id] ?? `Provider-side ${provider.auth} credentials/authorization appropriate for ${provider.name}, plus any instance URL, tenant identifier, scope or redirect configuration required by that provider. Registry metadata alone does not prove production contract completeness.`;

const entityScope: Record<string, string> = {
  genesys: "The dedicated Genesys Cloud path covers organization/user/license/routing/analytics evidence supported by the implemented integration.",
  github: "Repositories, workflow runs and supported security findings, with stale-entity reconciliation after successful snapshots.",
  jira: "Projects and issues from the implemented Jira sync path, with stale-entity reconciliation.",
  slack: "Workspace/channel evidence from the implemented Slack sync path, with stale-entity reconciliation.",
  salesforce: "Organization-level Salesforce evidence from the implemented sync path.",
  servicenow: "Users from the implemented ServiceNow sync path, with stale-entity reconciliation.",
  m365: "Users, subscribed SKUs and user-to-SKU license assignments, with stale-entity reconciliation.",
};

const connectedCriteria = "Connected requires all three facts: server-side credentials are present; the real provider health check is healthy; and a real synchronization succeeds with lastSuccessfulAt populated. Authentication alone is not Connected, and healthy health without successful sync is not Connected.";

const statusFor = (provider: ProviderDefinition): "full read/sync contract" | "auth available / contract incomplete" | "catalog only" => fullContract.has(provider.id) ? "full read/sync contract" : authImplemented.has(provider.id) ? "auth available / contract incomplete" : "catalog only";

const capabilitiesFor = (provider: ProviderDefinition): string[] => {
  if (provider.id === "github") return ["Read: repositories, workflow and supported security evidence.", "Sync: provider snapshots plus stale-entity reconciliation.", "Write: GitHub create issue only through the governed approved-action path with provider read-back verification."];
  if (fullContract.has(provider.id)) return ["Read: implemented provider evidence.", "Sync: implemented provider synchronization and evidence persistence.", "Write: not enabled."];
  if (authImplemented.has(provider.id)) return ["Auth: a real server-side authentication/credential path exists.", "Read/sync: contract incomplete; production Connected must not be inferred from auth.", "Write: not enabled."];
  return ["Catalog only: no verified production authentication path.", "Read/sync: production connection/sync remains provider_not_implemented.", "Write: not enabled."];
};

const governedActions = (provider: ProviderDefinition) => provider.id === "github"
  ? "GitHub create issue is the only documented governed external write. Lifecycle: Proposed → Approved / Ready to Execute → Executing → Verified | Failed. The server verifies the created issue, posts provider sync/reconciliation and records immutable audit evidence. Verification Unsupported is reserved for a future action where authoritative verification is genuinely impossible."
  : "Not enabled for external mutations. Registry capability flags such as write/events do not by themselves enable production writes.";

const commonFailures = (provider: ProviderDefinition) => [
  "Authentication succeeds but status is pending → waiting for healthy health evidence and successful sync with lastSuccessfulAt.",
  "Health is healthy but sync fails → still not Connected.",
  `${provider.name} returns provider_not_implemented → it is not admitted to the production contract path yet.`,
  "Do not treat a catalog card, OAuth callback or stored credential as proof of production readiness.",
];

function buildConnectSteps(provider: ProviderDefinition): string[] {
  const steps = [
    "Open Integrations and select the provider.",
    `Use the configured ${provider.auth} flow and supply only the fields requested by the product form.`,
  ];
  if (provider.id === "github") steps.push("Continue to GitHub, install the Aegis GitHub App and select only the repositories it should access.");
  if (provider.id === "aws") steps.push("Use the generated external ID in the AWS role trust relationship, provide the role ARN, and complete connection validation.");
  if (provider.id === "gcp") steps.push("Provide the service-account email, project ID and private key; the server validates access to the target project before storing the encrypted credential set.");
  if (provider.id === "google-workspace") steps.push("Provide the service-account email, delegated admin email and private key configured for Workspace domain-wide delegation.");
  if (provider.id === "sap") steps.push("Enter the authorization URL, token URL and optional API base URL from the SAP service binding; do not substitute guessed endpoints.");
  if (provider.id === "servicenow") steps.push("Enter the ServiceNow instance URL plus OAuth client ID/secret and use the configured redirect URI.");
  if (provider.id === "zendesk") steps.push("Provide the Zendesk subdomain plus the global OAuth client ID/secret.");
  if (provider.id === "workday") steps.push("Select the Workday region and enter the tenant alias plus OAuth client credentials.");
  steps.push(
    "Complete authorization or credential validation and wait for the actual connection result.",
    "Run Sync Now when the provider has an implemented production sync path.",
    "Review health, lastSuccessfulAt, record count and any reconciliation/stale evidence before relying on the provider in live workflows.",
  );
  return steps;
}

export function buildProviderHelpTopic(provider: ProviderDefinition): HelpTopic {
  const status = statusFor(provider);
  const scope = entityScope[provider.id] ?? "Contract-backed entity scope is not documented for this provider because the production health/sync contract is not complete.";
  return {
    id: `provider-${provider.id}`,
    title: `${provider.name} setup`,
    group: PROVIDER_HELP_GROUP,
    summary: `${provider.name} setup with an explicit production contract boundary: ${status}.`,
    sections: [
      s("What it is", provider.description),
      s("Contract status", status),
      s("Auth model", authModel[provider.id] ?? provider.auth),
      s("Prerequisites", defaultPrerequisites(provider)),
      s("Step-by-step connect", "Use the real Integrations surface. Unsupported production paths must remain explicitly unsupported.", [], buildConnectSteps(provider)),
      s("Health & sync", `${scope} ${fullContract.has(provider.id) ? "Successful contract-backed sync reconciles entities absent from the latest successful snapshot as stale where implemented." : "This provider is not currently contract-complete, so authentication alone must not be treated as Connected."}`),
      s("Connected criteria", connectedCriteria),
      s("Capabilities", "Current production capability boundary:", capabilitiesFor(provider)),
      s("Governed actions", governedActions(provider)),
      s("Common failures / integrity notes", "Use these diagnostics without upgrading a partial implementation into a production claim:", commonFailures(provider)),
    ],
    relatedRoutes: [
      { label: "Integrations", to: "/integrations" },
      { label: "How to connect a provider", to: "/help?topic=connect-provider", topic: "connect-provider" },
    ],
  };
}

export const PROVIDER_HELP_TOPICS: HelpTopic[] = PROVIDER_REGISTRY.map(buildProviderHelpTopic);
