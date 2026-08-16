// Provider-agnostic capability registry types and normalized data contracts.
// Client-safe: no credentials, no provider SDKs, no server-only imports.

export type CapabilityKey =
  | "license_inventory"
  | "user_inventory"
  | "queue_inventory"
  | "routing_inventory"
  | "presence_inventory"
  | "cloud_resource_inventory"
  | "cost_inventory"
  | "security_findings";

export interface CapabilityDef {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  category: string;
  readOnly: boolean;
  writeCapable: boolean;
}

/** Presentation metadata for providers. Adding a provider never touches agent logic. */
export const PROVIDER_LABELS: Record<string, { name: string; logo: string; category: string }> = {
  genesys: { name: "Genesys Cloud", logo: "🎧", category: "Contact Center" },
  microsoft365: { name: "Microsoft 365", logo: "🪟", category: "Productivity" },
  aws: { name: "AWS", logo: "☁️", category: "Cloud" },
  azure: { name: "Microsoft Azure", logo: "🔷", category: "Cloud" },
  salesforce: { name: "Salesforce", logo: "☁︎", category: "CRM" },
  servicenow: { name: "ServiceNow", logo: "🛎️", category: "ITSM" },
  jira: { name: "Jira", logo: "🧩", category: "ITSM" },
  okta: { name: "Okta", logo: "🔐", category: "Identity" },
};

export function providerLabel(provider: string) {
  return (
    PROVIDER_LABELS[provider] ?? {
      name: provider,
      logo: "🔌",
      category: "Integration",
    }
  );
}

/** UI state vocabulary for a data source on an agent. */
export type DataSourceState =
  | "active"
  | "connected_not_bound"
  | "unhealthy"
  | "stale"
  | "capability_unavailable"
  | "not_connected";

export const DATA_SOURCE_STATE_LABELS: Record<DataSourceState, string> = {
  active: "Active data source.",
  connected_not_bound: "Connected — not enabled for this agent.",
  unhealthy: "Connection requires attention.",
  stale: "Data source requires synchronization.",
  capability_unavailable: "This provider does not currently support this capability.",
  not_connected: "Connect an integration to use this agent.",
};

// ---------------------------------------------------------------------------
// Normalized (provider-neutral) data contracts
// Provider implementations map vendor payloads into these shapes. Anything
// vendor-specific belongs in `metadata`, never as a top-level field.
// ---------------------------------------------------------------------------

export interface NormalizedEntitlement {
  provider: string;
  integrationId: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  entitlementId: string;
  entitlementName: string | null;
  status: "active" | "inactive" | "unknown";
  usageStatus: "active" | "inactive" | "unknown";
  lastActivityAt: string | null;
  metadata: Record<string, unknown>;
}

export interface NormalizedUser {
  provider: string;
  integrationId: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  status: string | null;
  lastActivityAt: string | null;
  metadata: Record<string, unknown>;
}

export interface NormalizedQueue {
  provider: string;
  integrationId: string;
  queueId: string;
  queueName: string | null;
  memberCount: number | null;
  metadata: Record<string, unknown>;
}

/** Result envelope returned by the capability router for every capability call. */
export interface CapabilityResult<T> {
  capability: CapabilityKey;
  records: T[];
  sources: Array<{
    integrationId: string;
    provider: string;
    displayName: string;
    implemented: boolean;
    recordCount: number;
    lastSyncAt: string | null;
    warning?: string;
  }>;
  warnings: string[];
}
