import type { ProviderDefinition } from "./provider-registry";

export type ConnectorStatus = "connected" | "pending" | "failed" | "disconnected";
export type VerificationStatus = "verified" | "unverified" | "failed" | "unsupported";

export interface ProviderSyncEvidence {
  status: "success" | "failed" | "never";
  lastAttemptedAt: string | null;
  lastSuccessfulAt: string | null;
  recordCount: number;
  error: string | null;
}

export interface ProviderHealthEvidence {
  status: "healthy" | "unhealthy" | "unknown";
  checkedAt: string | null;
  error: string | null;
}

export interface ProviderConnectionEvidence {
  provider: string;
  configuredStatus: "connected" | "failed" | "disconnected";
  credentialPresent: boolean;
  health: ProviderHealthEvidence;
  sync: ProviderSyncEvidence;
}

/** The only place where a generic provider connection becomes connected. */
export function deriveConnectorStatus(input: ProviderConnectionEvidence): ConnectorStatus {
  if (input.configuredStatus === "disconnected") return "disconnected";
  if (!input.credentialPresent) return "failed";
  if (input.health.status === "unhealthy" || input.sync.status === "failed") return "failed";
  if (input.health.status === "healthy" && input.sync.status === "success" && input.sync.lastSuccessfulAt) return "connected";
  return "pending";
}

export interface ProviderConnectorContract {
  definition: ProviderDefinition;
  connectOrAuthorize: (...args: never[]) => Promise<unknown>;
  validateConnection: (...args: never[]) => Promise<unknown>;
  refreshCredentials: (...args: never[]) => Promise<unknown>;
  disconnect: (...args: never[]) => Promise<unknown>;
  healthCheck: (...args: never[]) => Promise<ProviderHealthEvidence>;
  sync: (...args: never[]) => Promise<ProviderSyncEvidence>;
  getSyncStatus: (...args: never[]) => Promise<ProviderSyncEvidence>;
  getCapabilities: () => ProviderDefinition["capabilities"];
  executeApprovedAction: (...args: never[]) => Promise<{ ok: false; errorCode: "provider_action_unsupported" }>;
}

/** Providers with a real read/sync path through the production contract. */
export const CONTRACT_IMPLEMENTED_PROVIDERS = new Set([
  "genesys",
  "github",
  "jira",
  "slack",
  "salesforce",
  "servicenow",
  "m365",
]);

export function isContractImplementedProvider(provider: string): boolean {
  return CONTRACT_IMPLEMENTED_PROVIDERS.has(provider);
}
