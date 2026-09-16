import { getProviderReadiness, isContractComplete, type ContractReadiness } from "./provider-contract.dynamic";

export const CONTRACT_IMPLEMENTED_PROVIDERS = new Set<string>([
  "genesys",
  "github",
  "jira",
  "slack",
  "salesforce",
  "servicenow",
  "m365",
]);

export function isContractImplementedProvider(provider: string): boolean {
  return isContractComplete(provider);
}

export function getProviderContractReadiness(provider: string): ContractReadiness {
  return getProviderReadiness(provider);
}
