import { PROVIDER_REGISTRY, type ProviderDefinition } from "./provider-registry";

export type ContractReadiness = "complete" | "auth_only" | "no_verified_auth";

/**
 * Explicit production evidence for contract admission. This is intentionally
 * separate from PROVIDER_REGISTRY: registry availability describes product
 * catalog intent, while this manifest describes verified implementation.
 */
const READINESS: Record<string, ContractReadiness> = {
  genesys: "complete",
  github: "complete",
  jira: "complete",
  slack: "complete",
  salesforce: "complete",
  servicenow: "complete",
  m365: "complete",
  aws: "auth_only",
  azure: "auth_only",
  "google-workspace": "auth_only",
  freshworks: "auth_only",
  zendesk: "auth_only",
  zoho: "auth_only",
  hubspot: "auth_only",
  gitlab: "auth_only",
  confluence: "auth_only",
  rubrik: "auth_only",
  veeam: "auth_only",
  cohesity: "auth_only",
  crowdstrike: "auth_only",
  "microsoft-defender": "auth_only",
  okta: "auth_only",
  datadog: "auth_only",
  newrelic: "auth_only",
  splunk: "auth_only",
  pagerduty: "auth_only",
  workday: "auth_only",
  sap: "auth_only",
  oracle: "auth_only",
  snowflake: "auth_only",
  mongodb: "auth_only",
  gcp: "no_verified_auth",
};

export function getProviderReadiness(provider: string): ContractReadiness {
  return READINESS[provider] ?? "no_verified_auth";
}

export function isContractComplete(provider: string): boolean {
  return getProviderReadiness(provider) === "complete";
}

export function getContractProviderDefinitions(): ProviderDefinition[] {
  return PROVIDER_REGISTRY.filter((provider) => isContractComplete(provider.id));
}

export function getProviderReadinessMatrix(): Array<{
  provider: ProviderDefinition;
  readiness: ContractReadiness;
}> {
  return PROVIDER_REGISTRY.map((provider) => ({ provider, readiness: getProviderReadiness(provider.id) }));
}
