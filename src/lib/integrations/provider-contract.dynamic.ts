import { PROVIDER_REGISTRY, type ProviderDefinition } from "./provider-registry";

export type ContractReadiness = "complete" | "auth_only" | "no_verified_auth";

const CONTRACT_COMPLETE = new Set(["genesys", "github", "jira", "slack", "salesforce", "servicenow", "m365"]);
const AUTH_ONLY = new Set([
  "aws", "azure", "google-workspace", "freshworks", "zendesk", "zoho", "hubspot", "gitlab",
  "confluence", "rubrik", "veeam", "cohesity", "crowdstrike", "microsoft-defender", "okta",
  "datadog", "newrelic", "splunk", "pagerduty", "workday", "sap", "oracle", "snowflake", "mongodb",
]);

export function getProviderReadiness(provider: string): ContractReadiness {
  if (CONTRACT_COMPLETE.has(provider)) return "complete";
  if (AUTH_ONLY.has(provider)) return "auth_only";
  return "no_verified_auth";
}

export function isContractComplete(provider: string): boolean {
  return getProviderReadiness(provider) === "complete";
}

export function getProviderReadinessMatrix(): Array<{ provider: ProviderDefinition; readiness: ContractReadiness }> {
  return PROVIDER_REGISTRY.map((provider) => ({ provider, readiness: getProviderReadiness(provider.id) }));
}
