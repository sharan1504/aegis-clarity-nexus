import type { HelpSection, HelpTopic } from "./content";
import { PROVIDER_REGISTRY, type ProviderDefinition } from "@/lib/integrations/provider-registry";
import { CONTRACT_IMPLEMENTED_PROVIDERS } from "@/lib/integrations/provider-contract";

export const PROVIDER_HELP_GROUP = "Provider setup guides" as const;

const s = (heading: string, body: string, bullets?: string[], steps?: string[]): HelpSection => ({ heading, body, bullets, steps });

const fullContract = new Set(CONTRACT_IMPLEMENTED_PROVIDERS);

const authImplemented = new Set([
  "genesys", "aws", "azure", "m365", "gcp", "google-workspace", "jira", "servicenow", "freshworks", "zendesk", "salesforce", "zoho", "hubspot", "slack", "github", "gitlab", "confluence", "rubrik", "veeam", "cohesity", "crowdstrike", "microsoft-defender", "okta", "datadog", "newrelic", "splunk", "pagerduty", "workday", "sap", "oracle", "snowflake", "mongodb",
]);

const authModel: Record<string, string> = {
  genesys: "OAuth 2.0 using the dedicated Genesys Cloud integration flow.",
  github: "GitHub App installation. The product does not use a personal access token for the integration flow.",
  aws: "AWS IAM role assumption using a role ARN and a generated external ID.",
  azure: "Microsoft Entra client-credentials authentication for Azure management APIs. The current Help guidance does not treat this as contract-complete.",
  m365: "Microsoft Entra application / client-credentials authentication for Microsoft Graph.",
  gcp: "Google service account credentials with a project ID.",
  "google-workspace": "Google service account with domain-wide delegated admin access.",
  jira: "OAuth 2.0 using a Jira OAuth client and redirect URI.",
  servicenow: "OAuth 2.0 using a ServiceNow instance URL, client ID/secret and redirect URI.",
  freshworks: "OAuth 2.0 using the Freshservice organization URL and OAuth client credentials.",
  zendesk: "OAuth 2.0 using a Zendesk subdomain and OAuth client credentials.",
  salesforce: "OAuth 2.0 using a Salesforce client and redirect URI.",
  zoho: "OAuth 2.0 using the selected Zoho Accounts URL and OAuth client credentials.",
  hubspot: "OAuth 2.0 using HubSpot client credentials and redirect URI.",
  slack: "OAuth 2.0 using Slack client credentials and redirect URI.",
  gitlab: "OAuth 2.0 using the GitLab instance URL, client credentials and redirect URI.",
  confluence: "OAuth 2.0 using Confluence OAuth client credentials and redirect URI.",
  rubrik: "Client-credentials authentication using Rubrik Security Cloud client credentials and an access-token URI.",
  veeam: "Veeam Service Provider Console username/password flow through the provider connector.",
  cohesity: "API key against a configured Cohesity API base URL.",
  crowdstrike: "OAuth 2.0 client credentials against the configured Falcon API base URL.",
  "microsoft-defender": "Microsoft Entra application client credentials with tenant context.",
  okta: "Okta SSWS API token against the configured org URL.",
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
  genesys: "A Genesys Cloud OAuth client, client secret, supported Genesys region and the redirect URI configured for the product flow.",
  github: "Access to install the Aegis GitHub App and select the repositories the installation may read. Do not use a PAT in place of the App installation flow.",
  aws: "An AWS account administrator must create or allow a role that trusts the Aegis AWS account and the generated external ID. The product form provides the external ID and trust-policy material.",
  azure: "An Entra application with a client secret, tenant ID and permission to read Azure subscriptions through the management API.",
  m365: "An Entra application with client ID/secret, tenant ID and the Graph permissions required by the implemented M365 sync path.",
  gcp: "A Google Cloud service account, private key, project ID and permission to read the target project.",
  "google-workspace": "A Google service account and a delegated admin identity configured for the required Workspace Admin SDK read scopes.",
  servicenow: "A ServiceNow instance URL, OAuth application, client ID/secret and matching redirect URI.",
  freshworks: "A Freshservice organization URL, OAuth application, client ID/secret and redirect URI.",
  zendesk: "A Zendesk subdomain, global OAuth client and client secret with the product redirect URI configured.",
  workday: "A Workday tenant alias, region, OAuth client ID/secret and redirect URI configured for the target tenant.",
  sap: "An SAP product or BTP service binding that supplies the exact OAuth authorization/token URLs and optional API base URL; these endpoints are not inferred by the product.",
};

const defaultPrerequisites = (provider: ProviderDefinition) => {
  const configured = prerequisites[provider.id];
  return configured ?? `Provider-side ${provider.auth} credentials/authorization appropriate for ${provider.name}, plus any instance URL, tenant identifier, scope or redirect configuration required by that provider. The registry declaration alone does not prove production contract completeness.`;
};

const entityScope: Record<string, string> = {
  genesys: "Dedicated Genesys Cloud connector data such as organization/user/license/routing/analytics evidence according to the implemented integration path.",
  github: "Repositories, workflow runs and supported security findings, with stale-entity reconciliation on successful snapshots.",
  jira: "Projects and issues from the implemented Jira sync path, with stale-entity reconciliation.",
  slack: "Workspace/channel data from the implemented Slack sync path, with stale-entity reconciliation.",
  salesforce: "Organization-level Salesforce evidence from the implemented sync path.",
  servicenow: "Users from the implemented ServiceNow sync path, with stale-entity reconciliation.",
  m365: "Users, subscribed SKUs and user-to-SKU license assignments, with stale-entity reconciliation.",
};

const connectedCriteria = "Connected is evidence-derived: credentials must be present server-side, the real provider health check must be healthy, and a real sync must have status success with a non-null lastSuccessfulAt. Missing or failed evidence keeps the connection pending/failed rather than Connected.";

function statusFor(provider: ProviderDefinition): string {
  if (fullContract.has(provider.id)) return "full read/sync contract";
  if (authImplemented.has(provider.id)) return "auth available / contract incomplete";
  return "catalog only";
}

function capabilitiesFor(provider: ProviderDefinition): string[] {
  if (provider.id === "github") return ["Read: repositories, workflow/security evidence through the implemented connector.", "Sync: provider snapshot persistence and stale-entity reconciliation.", "Write: GitHub create issue only, through the governed approved-action path with provider verification."];
  if (fullContract.has(provider.id)) return ["Read: implemented provider evidence.", "Sync: implemented provider synchronization and evidence persistence where documented.", "Write: not enabled unless explicitly called out for GitHub."];
  if (authImplemented.has(provider.id)) return ["Auth: a real authentication/credential implementation exists.", "Read/sync: not contract-complete, so production provider evidence must not be assumed.", "Write: not enabled."];
  return ["Catalog only: no verified production connection/sync path.", "Read/sync: provider_not_implemented on the production connector entry point.", "Write: not enabled."];
}

function actionGuidance(provider: ProviderDefinition): string {
  if (provider.id === "github") return "GitHub create issue is the only currently documented governed external write. The lifecycle is Proposed → Approved / Ready to Execute → Executing → Verified | Failed, with provider read-back verification, post-change sync/reconciliation and immutable audit evidence. Verification Unsupported is reserved for a future action where authoritative verification is genuinely impossible.";
  return "Not enabled for external mutations. Registry capability flags such as write/events do not by themselves enable production writes.";
}

const commonFailures = (provider: ProviderDefinition) => [
  "Authentication succeeds but status remains pending → the runtime is waiting for healthy health evidence and a successful sync with lastSuccessfulAt.",
  "Health is healthy but sync fails → the provider is still not Connected.",
  `${provider.name} returns provider_not_implemented → it is not admitted to the production contract path yet.`,
  "Do not treat a catalog card, OAuth callback, or stored credential as proof of production readiness.",
];

export function buildProviderHelpTopic(provider: ProviderDefinition): HelpTopic {
  const status = statusFor(provider);
  const scope = entityScope[provider.id] ?? "Entity scope is not documented as contract-backed for this provider yet.";
  const steps = [
    "Open Integrations and select the provider.",
    `Use the provider's configured ${provider.auth} flow and supply only the fields requested by the integration form.`,
  ];
  if (provider.id === "github") steps.push("Continue to GitHub and install the Aegis GitHub App, selecting only the repositories the installation should access.");
  if (provider.id === "aws") steps.push("Use the generated external ID in the AWS role trust relationship, then provide the role ARN and run the product's connection validation path.");
  if (provider.id === "sap") steps.push("Enter the authorization URL, token URL and any API base URL from the SAP service binding; do not substitute guessed endpoints.");
  steps.push("Complete authentication or credential validation and wait for the connection result.", "Run Sync Now where the provider exposes the implemented sync path.", "Review health and synchronization evidence before treating the provider as operational data source.");

  return {
    id: `provider-${provider.id}`,
    title: `${provider.name} setup`,
    group: PROVIDER_HELP_GROUP,
    summary: `${provider.name} provider setup with an explicit contract boundary: ${status}.`,
    sections: [
      s("What it is", provider.description),
      s("Contract status", status),
      s("Auth model", authModel[provider.id] ?? provider.auth),
      s("Prerequisites", defaultPrerequisites(provider)),
      s("Step-by-step connect", "Use the real integration surface. The exact form is provider-specific; unsupported production paths must remain explicitly unsupported.", [], steps),
      s("Health & sync", `${scope} ${fullContract.has(provider.id) ? "For a contract-backed provider, successful sync also reconciles entities missing from the latest snapshot as stale where supported." : "For this provider, a complete health/sync contract is not currently documented, so do not infer a live Connected state from authentication alone."}`),
      s("Connected criteria", connectedCriteria),
      s("Capabilities", capabilitiesFor(provider)),
      s("Governed actions", actionGuidance(provider)),
      s("Common failures / integrity notes", "Use these diagnostics without upgrading partial implementations into production claims.", commonFailures(provider)),
    ],
    relatedRoutes: [
      { label: "Integrations", to: "/integrations" },
      { label: "How to connect a provider", to: "/help?topic=connect-provider", topic: "connect-provider" },
      { label: "Connector contract", to: "/docs/production-readiness/CONNECTOR_CONTRACT.md" },
    ],
  };
}

export const PROVIDER_HELP_TOPICS: HelpTopic[] = PROVIDER_REGISTRY.map(buildProviderHelpTopic);
